import { useEffect, useState, useCallback } from 'react';
import {
  Building2, Plus, Search, Pencil, Power, KeyRound, Archive,
  RefreshCw, Eye, MapPin, ChevronLeft, ChevronRight, LogIn,
  CalendarClock, CreditCard, ArrowUpDown, Hotel as HotelIcon, Radio,
} from 'lucide-react';
import { getEnterpriseHotels, getChannelManagerHotelStatuses, updateEnterpriseHotel, resetHotelPassword, getPlans, startImpersonation, logAudit } from '../api';
import type { ChannelManagerHotelStatus, EnterpriseHotel, SubscriptionPlan } from '../types';
import { ChannelStatusCell } from './ChannelStatusCell';
import {
  PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, ConfirmDialog,
  TextInput, SelectInput, statusColor, fmtDate,
} from '../ui';

interface Props {
  onViewHotel: (id: string) => void;
  onNewHotel: () => void;
  onImpersonate: (hotelId: string, hotelName: string) => void;
  onConfigureChannelManager?: (hotelId: string) => void;
}

type SortKey = 'hotel_name' | 'city' | 'subscription_expiry' | 'created_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

export const HotelsScreen = ({ onViewHotel, onNewHotel, onImpersonate, onConfigureChannelManager }: Props) => {
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelManagerHotelStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  // Action modals
  const [confirm, setConfirm] = useState<{ hotel: EnterpriseHotel; action: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<EnterpriseHotel | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editTarget, setEditTarget] = useState<EnterpriseHotel | null>(null);
  const [extendTarget, setExtendTarget] = useState<EnterpriseHotel | null>(null);
  const [extendDays, setExtendDays] = useState(14);
  const [planTarget, setPlanTarget] = useState<EnterpriseHotel | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [impersonateTarget, setImpersonateTarget] = useState<EnterpriseHotel | null>(null);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, p, channelRows] = await Promise.all([getEnterpriseHotels(), getPlans(), getChannelManagerHotelStatuses()]);
      setHotels(h.filter((x) => !x.archived_at));
      setPlans(p);
      setChannelStatuses(Object.fromEntries(channelRows.map((row) => [row.hotel_id, row])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const filtered = hotels.filter((h) => {
    if (statusFilter !== 'all' && h.subscription_status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return h.hotel_name.toLowerCase().includes(q) || h.owner_name.toLowerCase().includes(q)
        || h.admin_email.toLowerCase().includes(q) || h.city.toLowerCase().includes(q)
        || (h.property_code ?? '').toLowerCase().includes(q) || h.mobile.includes(search);
    }
    return true;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let av: string | number = a[sortKey] ?? '';
    let bv: string | number = b[sortKey] ?? '';
    if (typeof av === 'string' && typeof bv === 'string') {
      av = av.toLowerCase(); bv = bv.toLowerCase();
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const planName = (planId: string | null): string => {
    if (!planId) return 'Trial';
    return plans.find((p) => p.id === planId)?.name ?? 'Trial';
  };

  const handleAction = async () => {
    if (!confirm) return;
    const { hotel, action } = confirm;
    try {
      setBusy(true);
      if (action === 'activate') await updateEnterpriseHotel(hotel.id, { subscription_status: 'Active', is_active: true }, hotel);
      else if (action === 'suspend') await updateEnterpriseHotel(hotel.id, { subscription_status: 'Suspended', is_active: false }, hotel);
      else if (action === 'archive') await updateEnterpriseHotel(hotel.id, { archived_at: new Date().toISOString() }, hotel);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const handleReset = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      setBusy(true);
      await resetHotelPassword(resetTarget.admin_email, newPassword);
      await logAudit({ action: 'reset_owner_password', module: 'hotels', hotel_id: resetTarget.id, hotel_name: resetTarget.hotel_name, severity: 'warning' });
      setResetTarget(null); setNewPassword(''); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally { setBusy(false); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      setBusy(true);
      await updateEnterpriseHotel(editTarget.id, {
        hotel_name: editTarget.hotel_name,
        owner_name: editTarget.owner_name,
        admin_email: editTarget.admin_email,
        mobile: editTarget.mobile,
        address: editTarget.address,
        city: editTarget.city,
        state: editTarget.state,
        property_code: editTarget.property_code,
        total_rooms: editTarget.total_rooms,
      }, editTarget);
      await load();
      setEditTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally { setBusy(false); }
  };

  const handleExtend = async () => {
    if (!extendTarget) return;
    const currentExpiry = extendTarget.subscription_expiry ? new Date(extendTarget.subscription_expiry) : new Date();
    const newExpiry = new Date(currentExpiry.getTime() + extendDays * 86400000);
    try {
      setBusy(true);
      await updateEnterpriseHotel(extendTarget.id, {
        subscription_expiry: newExpiry.toISOString().slice(0, 10),
        subscription_status: extendTarget.subscription_status === 'Expired' ? 'Active' : extendTarget.subscription_status,
      }, extendTarget);
      await load();
      setExtendTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  const handleChangePlan = async () => {
    if (!planTarget || !newPlanId) return;
    try {
      setBusy(true);
      await updateEnterpriseHotel(planTarget.id, { plan_id: newPlanId }, planTarget);
      await load();
      setPlanTarget(null); setNewPlanId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  const handleImpersonate = async () => {
    if (!impersonateTarget || !impersonateReason.trim()) return;
    try {
      setBusy(true);
      await startImpersonation(impersonateTarget.id, impersonateTarget.hotel_name, impersonateReason.trim());
      onImpersonate(impersonateTarget.id, impersonateTarget.hotel_name);
      setImpersonateTarget(null); setImpersonateReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingState label="Loading hotels…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hotel Management"
        subtitle={`${filtered.length} of ${hotels.length} hotels`}
        action={
          <button onClick={onNewHotel} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-4 py-2.5 rounded-xl transition text-sm">
            <Plus className="w-4 h-4" /> Onboard New Hotel
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name, owner, email, city, mobile…"
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Trial">Trial</option>
          <option value="Expired">Expired</option>
          <option value="Suspended">Suspended</option>
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Table (desktop) / Cards (mobile) */}
      {paged.length === 0 ? (
        <EmptyState title="No hotels found" subtitle="Try adjusting your filters or onboard a new hotel." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 cursor-pointer hover:text-sky-600" onClick={() => toggleSort('hotel_name')}>
                      <span className="flex items-center gap-1">Hotel <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="px-4 py-3">Prop Code</th>
                    <th className="px-4 py-3 cursor-pointer hover:text-sky-600" onClick={() => toggleSort('city')}>
                      <span className="flex items-center gap-1">City <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Rooms</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Channel Manager</th>
                    <th className="px-4 py-3 cursor-pointer hover:text-sky-600" onClick={() => toggleSort('subscription_expiry')}>
                      <span className="flex items-center gap-1">Expiry <ArrowUpDown className="w-3 h-3" /></span>
                    </th>
                    <th className="px-4 py-3">Last Login</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-sky-600" />
                          </div>
                          <button onClick={() => onViewHotel(h.id)} className="font-semibold text-slate-800 hover:text-sky-600">{h.hotel_name}</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{h.property_code ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{h.city || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{h.owner_name || '—'}</p>
                        <p className="text-xs text-slate-400">{h.admin_email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{h.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{h.total_rooms}</td>
                      <td className="px-4 py-3 text-slate-600">{planName(h.plan_id)}</td>
                      <td className="px-4 py-3"><Badge color={statusColor(h.subscription_status)}>{h.subscription_status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <ChannelStatusCell status={channelStatuses[h.id]} />
                          {onConfigureChannelManager && (
                            <button
                              onClick={() => onConfigureChannelManager(h.id)}
                              className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg border border-purple-200 transition shrink-0"
                              title="Configure Channel Manager"
                            >
                              <Radio className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(h.subscription_expiry)}</td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(h.last_login_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <IconBtn title="View" onClick={() => onViewHotel(h.id)}><Eye className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Edit" onClick={() => setEditTarget({ ...h })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Login as Hotel" onClick={() => setImpersonateTarget(h)}><LogIn className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Extend Trial" onClick={() => { setExtendTarget(h); setExtendDays(14); }}><CalendarClock className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Change Plan" onClick={() => { setPlanTarget(h); setNewPlanId(h.plan_id ?? ''); }}><CreditCard className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Reset Password" onClick={() => { setResetTarget(h); setNewPassword(''); }}><KeyRound className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Suspend/Activate" onClick={() => setConfirm({ hotel: h, action: h.subscription_status === 'Active' ? 'suspend' : 'activate' })}><Power className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Archive" onClick={() => setConfirm({ hotel: h, action: 'archive' })}><Archive className="w-3.5 h-3.5" /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {paged.map((h) => (
              <Card key={h.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-sky-600" />
                    </div>
                    <div>
                      <button onClick={() => onViewHotel(h.id)} className="font-semibold text-slate-800 text-left">{h.hotel_name}</button>
                      <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{h.city || '—'}</p>
                    </div>
                  </div>
                  <Badge color={statusColor(h.subscription_status)}>{h.subscription_status}</Badge>
                </div>
                <p className="text-xs text-slate-500 mb-1">{h.owner_name} · {h.mobile || '—'}</p>
                <p className="text-xs text-slate-400 mb-1">{h.total_rooms} rooms · {planName(h.plan_id)}</p>
                <p className="text-xs text-slate-400 mb-2">Expires {fmtDate(h.subscription_expiry)} · Last login {fmtDate(h.last_login_at)}</p>
                <ChannelStatusCell status={channelStatuses[h.id]} />
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => onViewHotel(h.id)} className="flex items-center gap-1 bg-sky-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg">View</button>
                  <IconBtn title="Edit" onClick={() => setEditTarget({ ...h })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Login as Hotel" onClick={() => setImpersonateTarget(h)}><LogIn className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Extend" onClick={() => { setExtendTarget(h); setExtendDays(14); }}><CalendarClock className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Plan" onClick={() => { setPlanTarget(h); setNewPlanId(h.plan_id ?? ''); }}><CreditCard className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Reset" onClick={() => { setResetTarget(h); setNewPassword(''); }}><KeyRound className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Suspend" onClick={() => setConfirm({ hotel: h, action: h.subscription_status === 'Active' ? 'suspend' : 'activate' })}><Power className="w-3.5 h-3.5" /></IconBtn>
                  <IconBtn title="Archive" onClick={() => setConfirm({ hotel: h, action: 'archive' })}><Archive className="w-3.5 h-3.5" /></IconBtn>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">Page {page + 1} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirm dialog (activate/suspend/archive) */}
      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'suspend' ? 'Suspend Hotel' : confirm.action === 'activate' ? 'Activate Hotel' : 'Archive Hotel'}
          message={
            confirm.action === 'suspend' ? `Suspend "${confirm.hotel.hotel_name}"? The hotel will lose access immediately.`
            : confirm.action === 'activate' ? `Activate "${confirm.hotel.hotel_name}"? The hotel will regain access.`
            : `Archive "${confirm.hotel.hotel_name}"? It will be hidden from the main list but not deleted.`
          }
          confirmLabel={confirm.action === 'archive' ? 'Archive' : confirm.action === 'suspend' ? 'Suspend' : 'Activate'}
          danger={confirm.action === 'suspend' || confirm.action === 'archive'}
          onConfirm={handleAction}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <Modal title="Reset Owner Password" onClose={() => { setResetTarget(null); setNewPassword(''); }}>
          <p className="text-sm text-slate-600 mb-3">Set a new password for <span className="font-semibold">{resetTarget.admin_email}</span></p>
          <TextInput label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Min 6 characters" />
          <ModalActions onConfirm={handleReset} onCancel={() => { setResetTarget(null); setNewPassword(''); }} busy={busy} confirmLabel="Reset Password" />
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title="Edit Hotel" onClose={() => setEditTarget(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput label="Hotel Name" value={editTarget.hotel_name} onChange={(v) => setEditTarget({ ...editTarget, hotel_name: v })} />
            <TextInput label="Property Code" value={editTarget.property_code ?? ''} onChange={(v) => setEditTarget({ ...editTarget, property_code: v })} />
            <TextInput label="Owner Name" value={editTarget.owner_name} onChange={(v) => setEditTarget({ ...editTarget, owner_name: v })} />
            <TextInput label="Owner Email" value={editTarget.admin_email} onChange={(v) => setEditTarget({ ...editTarget, admin_email: v })} />
            <TextInput label="Mobile" value={editTarget.mobile} onChange={(v) => setEditTarget({ ...editTarget, mobile: v })} />
            <TextInput label="Total Rooms" type="number" value={String(editTarget.total_rooms)} onChange={(v) => setEditTarget({ ...editTarget, total_rooms: parseInt(v || '1', 10) })} />
            <TextInput label="City" value={editTarget.city} onChange={(v) => setEditTarget({ ...editTarget, city: v })} />
            <TextInput label="State" value={editTarget.state} onChange={(v) => setEditTarget({ ...editTarget, state: v })} />
            <TextInput label="Address" value={editTarget.address} onChange={(v) => setEditTarget({ ...editTarget, address: v })} />
          </div>
          <ModalActions onConfirm={handleEdit} onCancel={() => setEditTarget(null)} busy={busy} confirmLabel="Save Changes" />
        </Modal>
      )}

      {/* Extend trial modal */}
      {extendTarget && (
        <Modal title="Extend Trial / Expiry" onClose={() => setExtendTarget(null)}>
          <p className="text-sm text-slate-600 mb-3">
            Current expiry: <span className="font-semibold">{fmtDate(extendTarget.subscription_expiry)}</span>
          </p>
          <TextInput label="Days to Extend" type="number" value={String(extendDays)} onChange={(v) => setExtendDays(parseInt(v || '0', 10))} />
          <ModalActions onConfirm={handleExtend} onCancel={() => setExtendTarget(null)} busy={busy} confirmLabel="Extend" />
        </Modal>
      )}

      {/* Change plan modal */}
      {planTarget && (
        <Modal title="Change Subscription Plan" onClose={() => setPlanTarget(null)}>
          <p className="text-sm text-slate-600 mb-3">Hotel: <span className="font-semibold">{planTarget.hotel_name}</span></p>
          <SelectInput label="Select Plan" value={newPlanId} onChange={setNewPlanId}
            options={[{ value: '', label: 'Trial (no plan)' }, ...plans.map((p) => ({ value: p.id, label: `${p.name} (₹${p.price})` }))]} />
          <ModalActions onConfirm={handleChangePlan} onCancel={() => setPlanTarget(null)} busy={busy} confirmLabel="Change Plan" />
        </Modal>
      )}

      {/* Impersonate modal */}
      {impersonateTarget && (
        <Modal title="Login as Hotel" onClose={() => setImpersonateTarget(null)}>
          <p className="text-sm text-slate-600 mb-3">
            You are about to sign in as <span className="font-semibold">{impersonateTarget.hotel_name}</span> in Super Admin Support Mode. This will be logged.
          </p>
          <TextInput label="Reason (required)" value={impersonateReason} onChange={setImpersonateReason} placeholder="e.g. Customer support call #123" />
          <ModalActions onConfirm={handleImpersonate} onCancel={() => setImpersonateTarget(null)} busy={busy} confirmLabel="Start Session" disabled={!impersonateReason.trim()} />
        </Modal>
      )}
    </div>
  );
};

const IconBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
  <button title={title} onClick={onClick} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition">{children}</button>
);

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions = ({ onConfirm, onCancel, busy, confirmLabel, disabled }: { onConfirm: () => void; onCancel: () => void; busy: boolean; confirmLabel: string; disabled?: boolean }) => (
  <div className="flex gap-2 pt-2">
    <button onClick={onConfirm} disabled={busy || disabled} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition text-sm">
      {busy ? 'Working…' : confirmLabel}
    </button>
    <button onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-sm">Cancel</button>
  </div>
);
