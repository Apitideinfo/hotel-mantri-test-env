import { useEffect, useState, useCallback } from 'react';
import { Bell, Check, Trash2 } from 'lucide-react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, createNotification } from '../api';
import type { AppNotification } from '../types';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, TextArea, TextInput, SelectInput, fmtDateTime } from '../ui';

const TYPE_LABELS: Record<string, string> = {
  subscription_expiring: 'Subscription Expiring',
  payment_due: 'Payment Due',
  trial_ending: 'Trial Ending',
  new_lead: 'New Lead',
  demo_reminder: 'Demo Reminder',
  support_ticket: 'Support Ticket',
  critical_bug: 'Critical Bug',
  hotel_suspended: 'Hotel Suspended',
  hotel_created: 'Hotel Created',
  system_announcement: 'System Announcement',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'slate', medium: 'sky', high: 'amber', critical: 'red',
};

export const NotificationsScreen = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'system_announcement', title: '', message: '', priority: 'low', target_role: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const n = await getNotifications();
      setNotifications(n);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleCreate = async () => {
    setError(null);
    if (!form.title.trim()) { setError('Title is required.'); return; }
    try {
      setSaving(true);
      await createNotification({ type: form.type, title: form.title, message: form.message, priority: form.priority, target_role: form.target_role });
      await load(); setShowCreate(false);
      setForm({ type: 'system_announcement', title: '', message: '', priority: 'low', target_role: '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState label="Loading notifications…" />;

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" subtitle={`${notifications.length} total · ${unread} unread`}
        action={<button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm"><Bell className="w-4 h-4" /> Create</button>}
      />

      {error && <ErrorState message={error} />}

      {unread > 0 && (
        <button onClick={handleMarkAll} className="flex items-center gap-1.5 text-sm text-sky-600 font-medium hover:underline">
          <Check className="w-4 h-4" /> Mark all as read
        </button>
      )}

      {showCreate && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Create Notification</h3>
          <SelectInput label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })}
            options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <TextInput label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <TextArea label="Message" value={form.message} onChange={(v) => setForm({ ...form, message: v })} />
          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
              options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' }]} />
            <TextInput label="Target Role (optional)" value={form.target_role} onChange={(v) => setForm({ ...form, target_role: v })} placeholder="e.g. sales_manager" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm">{saving ? 'Creating…' : 'Create'}</button>
            <button onClick={() => setShowCreate(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl text-sm">Cancel</button>
          </div>
        </Card>
      )}

      {notifications.length === 0 && !showCreate ? (
        <EmptyState title="No notifications" subtitle="Create one to broadcast to your team." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={`p-4 ${n.is_read ? '' : 'border-sky-200 bg-sky-50/30'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-${PRIORITY_COLORS[n.priority] ?? 'slate'}-50`}>
                    <Bell className={`w-4 h-4 text-${PRIORITY_COLORS[n.priority] ?? 'slate'}-600`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                      {!n.is_read && <Badge color="sky">New</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{TYPE_LABELS[n.type] ?? n.type} · {fmtDateTime(n.created_at)}</p>
                  </div>
                </div>
                {!n.is_read && (
                  <button onClick={() => handleMarkRead(n.id)} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition">
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
