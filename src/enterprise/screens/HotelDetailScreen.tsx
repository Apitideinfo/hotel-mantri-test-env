import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Building2, Users, CreditCard, Activity, Ticket, ScrollText,
  ToggleLeft, MapPin, BedDouble, Plus, Trash2, Pencil, Power, X, Layers,
  LogIn, KeyRound, CalendarClock, Save, FileText,
} from 'lucide-react';
import {
  getEnterpriseHotel, getHotelFeatures, getPayments, getTickets, getAuditLogs,
  updateEnterpriseHotel, upsertHotelFeature, resetHotelPassword, startImpersonation,
  getEnterpriseRoomCategories, createEnterpriseRoomCategory, deleteEnterpriseRoomCategory,
  getEnterpriseRooms, createEnterpriseRoom, updateEnterpriseRoom, deleteEnterpriseRoom, bulkCreateEnterpriseRooms,
  logAudit,
} from '../api';
import { DataManagementTab } from './DataManagementTab';
import { SubscriptionTab } from './SubscriptionTab';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '../permissions';
import type { EnterpriseHotel, HotelFeature, SubscriptionPayment, SupportTicket, AuditLog } from '../types';
import { MODULE_KEYS, MODULE_LABELS } from '../types';
import { Card, Badge, LoadingState, ErrorState, ConfirmDialog, TextInput, SelectInput, NumInput, statusColor, fmtDate, fmtMoney, fmtDateTime } from '../ui';

interface Props {
  hotelId: string;
  onBack: () => void;
  onImpersonate: (hotelId: string, hotelName: string) => void;
  onViewInvoice: (id: string) => void;
  onCreateInvoice: () => void;
}

type Tab = 'overview' | 'owner' | 'property' | 'users' | 'subscription' | 'payments' | 'modules' | 'activity' | 'tickets' | 'audit' | 'data-management';

export const HotelDetailScreen = ({ hotelId, onBack, onImpersonate, onViewInvoice, onCreateInvoice }: Props) => {
  const [hotel, setHotel] = useState<EnterpriseHotel | null>(null);
  const [features, setFeatures] = useState<HotelFeature[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);

  // Action modals
  const [editTarget, setEditTarget] = useState<EnterpriseHotel | null>(null);
  const [resetModal, setResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [extendModal, setExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState(14);
  const [impersonateModal, setImpersonateModal] = useState(false);
  const [impersonateReason, setImpersonateReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ action: string } | null>(null);
  const { companyRole } = useAuth();
  const canDelete = hasPermission(companyRole, 'hotels.delete');
  const canReset = hasPermission(companyRole, 'hotels.reset');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, f, p, t, a] = await Promise.all([
        getEnterpriseHotel(hotelId),
        getHotelFeatures(hotelId),
        getPayments(hotelId),
        getTickets(),
        getAuditLogs({ hotelId, limit: 50 }),
      ]);
      setHotel(h);
      setFeatures(f);
      setPayments(p);
      setTickets(t.filter((x) => x.hotel_id === hotelId));
      setAuditLogs(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      setBusy(true);
      await updateEnterpriseHotel(editTarget.id, {
        hotel_name: editTarget.hotel_name, owner_name: editTarget.owner_name,
        admin_email: editTarget.admin_email, mobile: editTarget.mobile,
        address: editTarget.address, city: editTarget.city, state: editTarget.state,
        property_code: editTarget.property_code, total_rooms: editTarget.total_rooms,
      }, hotel ?? undefined);
      await load();
      setEditTarget(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (!hotel || !newPassword) return;
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      setBusy(true);
      await resetHotelPassword(hotel.admin_email, newPassword);
      await logAudit({ action: 'reset_owner_password', module: 'hotels', hotel_id: hotel.id, hotel_name: hotel.hotel_name, severity: 'warning' });
      setResetModal(false); setNewPassword('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const handleExtend = async () => {
    if (!hotel) return;
    const currentExpiry = hotel.subscription_expiry ? new Date(hotel.subscription_expiry) : new Date();
    const newExpiry = new Date(currentExpiry.getTime() + extendDays * 86400000);
    try {
      setBusy(true);
      await updateEnterpriseHotel(hotel.id, {
        subscription_expiry: newExpiry.toISOString().slice(0, 10),
        subscription_status: hotel.subscription_status === 'Expired' ? 'Active' : hotel.subscription_status,
      }, hotel);
      await load();
      setExtendModal(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const handleImpersonate = async () => {
    if (!hotel || !impersonateReason.trim()) return;
    try {
      setBusy(true);
      await startImpersonation(hotel.id, hotel.hotel_name, impersonateReason.trim());
      onImpersonate(hotel.id, hotel.hotel_name);
      setImpersonateModal(false); setImpersonateReason('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const handleStatusAction = async () => {
    if (!hotel || !confirmAction) return;
    try {
      setBusy(true);
      if (confirmAction.action === 'activate') await updateEnterpriseHotel(hotel.id, { subscription_status: 'Active', is_active: true }, hotel);
      else if (confirmAction.action === 'suspend') await updateEnterpriseHotel(hotel.id, { subscription_status: 'Suspended', is_active: false }, hotel);
      else if (confirmAction.action === 'archive') await updateEnterpriseHotel(hotel.id, { archived_at: new Date().toISOString() }, hotel);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); setConfirmAction(null); }
  };

  if (loading) return <LoadingState label="Loading hotel details…" />;
  if (error) return <ErrorState message={error} />;
  if (!hotel) return <ErrorState message="Hotel not found" />;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'owner', label: 'Owner' },
    { key: 'property', label: 'Property Master' },
    { key: 'users', label: 'Users' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'payments', label: 'Payments' },
    { key: 'modules', label: 'Feature Controls' },
    { key: 'activity', label: 'Activity' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'audit', label: 'Audit History' },
    { key: 'data-management', label: 'Data Management' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">{hotel.hotel_name}</h1>
            <Badge color={statusColor(hotel.subscription_status)}>{hotel.subscription_status}</Badge>
          </div>
          <p className="text-sm text-slate-500">{hotel.property_code ?? 'No property code'} · {hotel.city}, {hotel.state}</p>
        </div>
        {/* Action buttons */}
        <div className="hidden lg:flex items-center gap-1">
          <ActionBtn title="Edit" onClick={() => setEditTarget({ ...hotel })}><Pencil className="w-4 h-4" /></ActionBtn>
          <ActionBtn title="Create Invoice" onClick={onCreateInvoice}><FileText className="w-4 h-4" /></ActionBtn>
          <ActionBtn title="Login as Hotel" onClick={() => setImpersonateModal(true)}><LogIn className="w-4 h-4" /></ActionBtn>
          <ActionBtn title="Extend Trial" onClick={() => setExtendModal(true)}><CalendarClock className="w-4 h-4" /></ActionBtn>
          <ActionBtn title="Reset Password" onClick={() => setResetModal(true)}><KeyRound className="w-4 h-4" /></ActionBtn>
          <ActionBtn title={hotel.subscription_status === 'Active' ? 'Suspend' : 'Activate'} onClick={() => setConfirmAction({ action: hotel.subscription_status === 'Active' ? 'suspend' : 'activate' })}><Power className="w-4 h-4" /></ActionBtn>
        </div>
      </div>

      {/* Mobile action row */}
      <div className="lg:hidden flex items-center gap-1 flex-wrap">
        <button onClick={() => setEditTarget({ ...hotel })} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg"><Pencil className="w-3.5 h-3.5" /> Edit</button>
        <button onClick={onCreateInvoice} className="flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1.5 rounded-lg"><FileText className="w-3.5 h-3.5" /> Invoice</button>
        <button onClick={() => setImpersonateModal(true)} className="flex items-center gap-1 text-xs bg-sky-100 text-sky-700 font-semibold px-2.5 py-1.5 rounded-lg"><LogIn className="w-3.5 h-3.5" /> Login as Hotel</button>
        <button onClick={() => setExtendModal(true)} className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1.5 rounded-lg"><CalendarClock className="w-3.5 h-3.5" /> Extend</button>
        <button onClick={() => setResetModal(true)} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 font-semibold px-2.5 py-1.5 rounded-lg"><KeyRound className="w-3.5 h-3.5" /> Reset</button>
        <button onClick={() => setConfirmAction({ action: hotel.subscription_status === 'Active' ? 'suspend' : 'activate' })} className="flex items-center gap-1 text-xs bg-red-100 text-red-700 font-semibold px-2.5 py-1.5 rounded-lg"><Power className="w-3.5 h-3.5" /> {hotel.subscription_status === 'Active' ? 'Suspend' : 'Activate'}</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-slate-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
              tab === t.key ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoCard icon={<Building2 className="w-4 h-4" />} title="Hotel Info">
            <Row label="Name" value={hotel.hotel_name} />
            <Row label="Property Code" value={hotel.property_code ?? '—'} />
            <Row label="Total Rooms" value={String(hotel.total_rooms)} />
            <Row label="Created" value={fmtDate(hotel.created_at)} />
          </InfoCard>
          <InfoCard icon={<Users className="w-4 h-4" />} title="Owner">
            <Row label="Name" value={hotel.owner_name || '—'} />
            <Row label="Email" value={hotel.admin_email} />
            <Row label="Mobile" value={hotel.mobile || '—'} />
            <Row label="Last Login" value={fmtDate(hotel.last_login_at)} />
          </InfoCard>
          <InfoCard icon={<CreditCard className="w-4 h-4" />} title="Subscription">
            <Row label="Status" value={hotel.subscription_status} />
            <Row label="Start" value={fmtDate(hotel.subscription_start)} />
            <Row label="Expiry" value={fmtDate(hotel.subscription_expiry)} />
            <Row label="Total Payments" value={String(payments.length)} />
          </InfoCard>
        </div>
      )}

      {tab === 'owner' && (
        <Card className="p-5 space-y-3">
          <Row label="Owner Name" value={hotel.owner_name || '—'} />
          <Row label="Email" value={hotel.admin_email} />
          <Row label="Mobile" value={hotel.mobile || '—'} />
          <Row label="Last Login" value={fmtDate(hotel.last_login_at)} />
        </Card>
      )}

      {tab === 'property' && (
        <PropertyMasterTab hotelId={hotelId} hotelName={hotel.hotel_name} />
      )}

      {tab === 'users' && (
        <Card className="p-5">
          <p className="text-sm text-slate-500 mb-3">Hotel user management is available in the hotel's own panel. Here you can see the owner account:</p>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-xs font-bold">{hotel.admin_email[0]?.toUpperCase()}</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{hotel.owner_name || 'Owner'}</p>
              <p className="text-xs text-slate-400">{hotel.admin_email}</p>
            </div>
            <Badge color="sky">Hotel Admin</Badge>
          </div>
        </Card>
      )}

      {tab === 'subscription' && (
        <SubscriptionTab hotel={hotel} onReload={load} onCreateInvoice={onCreateInvoice} onViewInvoice={onViewInvoice} />
      )}

      {tab === 'payments' && (
        <Card className="overflow-hidden">
          {payments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No payments recorded</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Mode</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(p.payment_date)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">{fmtMoney(p.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{p.invoice_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.payment_mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'modules' && (
        <Card className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULE_KEYS.map((key) => {
              const f = features.find((x) => x.module_key === key);
              const enabled = f?.is_enabled ?? true;
              return (
                <div key={key} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm font-medium text-slate-700">{MODULE_LABELS[key]}</span>
                  <button onClick={async () => {
                    await upsertHotelFeature(hotelId, key, !enabled);
                    setFeatures((prev) => {
                      const existing = prev.find((x) => x.module_key === key);
                      if (existing) return prev.map((x) => x.module_key === key ? { ...x, is_enabled: !enabled } : x);
                      return [...prev, { id: '', hotel_id: hotelId, module_key: key, is_enabled: !enabled, updated_at: new Date().toISOString() }];
                    });
                  }}
                    className={`relative w-11 h-6 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === 'activity' && (
        <Card className="p-5">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No activity recorded.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.slice(0, 20).map((l) => (
                <div key={l.id} className="flex items-start justify-between p-2 bg-slate-50 rounded-lg">
                  <div><p className="text-sm font-semibold text-slate-800">{l.action}</p><p className="text-xs text-slate-400">{l.user_email} · {l.module}</p></div>
                  <span className="text-xs text-slate-400">{fmtDateTime(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'tickets' && (
        <Card className="overflow-hidden">
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No support tickets for this hotel</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                  <div><p className="text-sm font-semibold text-slate-800">{t.ticket_number}</p><p className="text-xs text-slate-400">{t.category} · {t.reporter}</p></div>
                  <div className="flex items-center gap-2">
                    <Badge color={t.priority === 'Critical' ? 'red' : t.priority === 'High' ? 'orange' : 'slate'}>{t.priority}</Badge>
                    <Badge color="sky">{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card className="overflow-hidden">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No audit logs for this hotel</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {auditLogs.map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{l.action}</p>
                    <span className="text-xs text-slate-400">{fmtDateTime(l.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{l.user_email} · {l.module}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'data-management' && (
        <DataManagementTab
          hotelId={hotelId}
          hotelName={hotel.hotel_name}
          propertyCode={hotel.property_code}
          adminEmail={hotel.admin_email}
          isImpersonating={false}
          canDelete={canDelete}
          canReset={canReset}
          onHotelDeleted={() => { onBack(); }}
          onHotelReset={() => { load(); }}
          onArchive={() => setConfirmAction({ action: 'archive' })}
        />
      )}

      {/* Modals */}
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
          </div>
          <ModalActions onConfirm={handleEdit} onCancel={() => setEditTarget(null)} busy={busy} confirmLabel="Save" />
        </Modal>
      )}

      {resetModal && (
        <Modal title="Reset Owner Password" onClose={() => setResetModal(false)}>
          <p className="text-sm text-slate-600 mb-3">Set a new password for <span className="font-semibold">{hotel.admin_email}</span></p>
          <TextInput label="New Password" value={newPassword} onChange={setNewPassword} type="password" placeholder="Min 6 characters" />
          <ModalActions onConfirm={handleReset} onCancel={() => setResetModal(false)} busy={busy} confirmLabel="Reset" />
        </Modal>
      )}

      {extendModal && (
        <Modal title="Extend Trial / Expiry" onClose={() => setExtendModal(false)}>
          <p className="text-sm text-slate-600 mb-3">Current expiry: <span className="font-semibold">{fmtDate(hotel.subscription_expiry)}</span></p>
          <TextInput label="Days to Extend" type="number" value={String(extendDays)} onChange={(v) => setExtendDays(parseInt(v || '0', 10))} />
          <ModalActions onConfirm={handleExtend} onCancel={() => setExtendModal(false)} busy={busy} confirmLabel="Extend" />
        </Modal>
      )}

      {impersonateModal && (
        <Modal title="Login as Hotel" onClose={() => setImpersonateModal(false)}>
          <p className="text-sm text-slate-600 mb-3">You are about to sign in as <span className="font-semibold">{hotel.hotel_name}</span> in Super Admin Support Mode. This will be logged.</p>
          <TextInput label="Reason (required)" value={impersonateReason} onChange={setImpersonateReason} placeholder="e.g. Customer support call #123" />
          <ModalActions onConfirm={handleImpersonate} onCancel={() => setImpersonateModal(false)} busy={busy} confirmLabel="Start Session" disabled={!impersonateReason.trim()} />
        </Modal>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.action === 'suspend' ? 'Suspend Hotel' : confirmAction.action === 'activate' ? 'Activate Hotel' : 'Archive Hotel'}
          message={confirmAction.action === 'suspend' ? `Suspend "${hotel.hotel_name}"?` : confirmAction.action === 'activate' ? `Activate "${hotel.hotel_name}"?` : `Archive "${hotel.hotel_name}"?`}
          confirmLabel={confirmAction.action === 'archive' ? 'Archive' : confirmAction.action === 'suspend' ? 'Suspend' : 'Activate'}
          danger={confirmAction.action === 'suspend' || confirmAction.action === 'archive'}
          onConfirm={handleStatusAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
};

// ── Property Master Tab ──

const PropertyMasterTab = ({ hotelId, hotelName }: { hotelId: string; hotelName: string }) => {
  const [categories, setCategories] = useState<{ id: string; name: string; default_tariff: number; extra_bed_charge: number }[]>([]);
  const [rooms, setRooms] = useState<{ id: string; room_no: string; category_id: string | null; floor: string | null; default_tariff: number; extra_bed_charge: number; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState('');
  const [catTariff, setCatTariff] = useState(0);
  const [catExtraBed, setCatExtraBed] = useState(0);

  // Room form
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [roomNo, setRoomNo] = useState('');
  const [roomCat, setRoomCat] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [roomTariff, setRoomTariff] = useState(0);
  const [roomExtraBed, setRoomExtraBed] = useState(0);
  const [roomActive, setRoomActive] = useState(true);

  // Bulk
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStart, setBulkStart] = useState(101);
  const [bulkEnd, setBulkEnd] = useState(110);
  const [bulkFloor, setBulkFloor] = useState('');
  const [bulkCat, setBulkCat] = useState('');

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, rs] = await Promise.all([getEnterpriseRoomCategories(hotelId), getEnterpriseRooms(hotelId)]);
      setCategories(cats as typeof categories);
      setRooms(rs as typeof rooms);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    try {
      setSaving(true);
      await createEnterpriseRoomCategory(hotelId, catName, catTariff, catExtraBed);
      setCatName(''); setCatTariff(0); setCatExtraBed(0); setShowCatForm(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Rooms will become uncategorized.')) return;
    try { await deleteEnterpriseRoomCategory(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  const handleAddRoom = async () => {
    if (!roomNo.trim()) return;
    try {
      setSaving(true);
      const catId = categories.find((c) => c.name === roomCat)?.id ?? null;
      await createEnterpriseRoom(hotelId, roomNo, catId, roomFloor || null, roomTariff, roomExtraBed, roomActive);
      setRoomNo(''); setRoomCat(''); setRoomFloor(''); setRoomTariff(0); setRoomExtraBed(0); setRoomActive(true); setShowRoomForm(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleBulkRooms = async () => {
    try {
      setSaving(true);
      const cat = categories.find((c) => c.name === bulkCat);
      const payloads = [];
      for (let n = bulkStart; n <= bulkEnd; n++) {
        payloads.push({
          room_no: String(n), category_id: cat?.id ?? null, floor: bulkFloor || null,
          default_tariff: cat?.default_tariff ?? 0, extra_bed_charge: cat?.extra_bed_charge ?? 0,
          is_active: true, sort_order: n,
        });
      }
      await bulkCreateEnterpriseRooms(hotelId, payloads);
      setShowBulk(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleToggleRoom = async (id: string, current: boolean) => {
    try { await updateEnterpriseRoom(id, { is_active: !current }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('Delete this room?')) return;
    try { await deleteEnterpriseRoom(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  if (loading) return <LoadingState label="Loading property master…" />;

  return (
    <div className="space-y-4">
      {error && <ErrorState message={error} />}

      {/* Room Categories */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><Layers className="w-4 h-4" /> Room Categories</h3>
          {!showCatForm && <button onClick={() => setShowCatForm(true)} className="flex items-center gap-1 text-sm text-sky-600 font-medium hover:underline"><Plus className="w-4 h-4" /> Add</button>}
        </div>
        {showCatForm && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-3">
            <TextInput label="Category Name" value={catName} onChange={setCatName} placeholder="e.g. Suite" />
            <div className="grid grid-cols-2 gap-2">
              <NumInput label="Default Tariff" value={catTariff} onChange={setCatTariff} />
              <NumInput label="Extra Bed Charge" value={catExtraBed} onChange={setCatExtraBed} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddCategory} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm">{saving ? 'Saving…' : 'Add Category'}</button>
              <button onClick={() => setShowCatForm(false)} className="bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          {categories.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No categories yet</p>}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-2 border border-slate-200 rounded-lg">
              <div><p className="text-sm font-semibold text-slate-700">{c.name}</p><p className="text-xs text-slate-400">₹{c.default_tariff} tariff · ₹{c.extra_bed_charge} extra bed</p></div>
              <button onClick={() => handleDeleteCategory(c.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </Card>

      {/* Room Inventory */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2"><BedDouble className="w-4 h-4" /> Room Inventory ({rooms.length})</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(!showBulk)} className="flex items-center gap-1 text-sm text-violet-600 font-medium hover:underline">Bulk Add</button>
            {!showRoomForm && <button onClick={() => setShowRoomForm(true)} className="flex items-center gap-1 text-sm text-sky-600 font-medium hover:underline"><Plus className="w-4 h-4" /> Add Room</button>}
          </div>
        </div>

        {showBulk && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumInput label="From" value={bulkStart} onChange={(v) => setBulkStart(Math.floor(v))} />
              <NumInput label="To" value={bulkEnd} onChange={(v) => setBulkEnd(Math.floor(v))} />
              <TextInput label="Floor" value={bulkFloor} onChange={setBulkFloor} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm">
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleBulkRooms} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm">{saving ? 'Creating…' : `Create ${bulkEnd - bulkStart + 1} Rooms`}</button>
              <button onClick={() => setShowBulk(false)} className="bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {showRoomForm && (
          <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <TextInput label="Room No." value={roomNo} onChange={setRoomNo} placeholder="e.g. 101" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select value={roomCat} onChange={(e) => {
                  setRoomCat(e.target.value);
                  const cat = categories.find((c) => c.name === e.target.value);
                  if (cat) { setRoomTariff(cat.default_tariff); setRoomExtraBed(cat.extra_bed_charge); }
                }} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm">
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <TextInput label="Floor" value={roomFloor} onChange={setRoomFloor} placeholder="e.g. 1st" />
              <NumInput label="Tariff" value={roomTariff} onChange={setRoomTariff} />
              <NumInput label="Extra Bed" value={roomExtraBed} onChange={setRoomExtraBed} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <button onClick={() => setRoomActive(!roomActive)} className={`w-full px-3 py-2 rounded-lg border text-sm font-semibold ${roomActive ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>{roomActive ? 'Active' : 'Inactive'}</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddRoom} disabled={saving} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg text-sm">{saving ? 'Saving…' : 'Add Room'}</button>
              <button onClick={() => setShowRoomForm(false)} className="bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {rooms.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No rooms added yet. These rooms will appear in {hotelName}'s Daily Entry Room Chart.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {rooms.map((r) => (
              <div key={r.id} className={`border rounded-lg p-2.5 ${r.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{r.room_no}</p>
                  <span className={`w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
                <p className="text-[10px] text-violet-600 truncate">{categories.find((c) => c.id === r.category_id)?.name ?? '—'}</p>
                {r.floor && <p className="text-[10px] text-slate-400">{r.floor}</p>}
                <p className="text-xs font-semibold text-slate-700">₹{r.default_tariff}</p>
                <div className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-100">
                  <button onClick={() => handleToggleRoom(r.id, r.is_active)} className="flex-1 p-1 text-slate-400 hover:text-amber-600"><Power className="w-3 h-3 mx-auto" /></button>
                  <button onClick={() => handleDeleteRoom(r.id)} className="flex-1 p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3 h-3 mx-auto" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Shared components ──

const InfoCard = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <Card className="p-5">
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 bg-sky-50 rounded-lg flex items-center justify-center text-sky-600">{icon}</div>
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h3>
    </div>
    <div className="space-y-2">{children}</div>
  </Card>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-sm font-medium text-slate-800">{value}</span>
  </div>
);

const ActionBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
  <button title={title} onClick={onClick} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition">{children}</button>
);

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions = ({ onConfirm, onCancel, busy, confirmLabel, disabled }: { onConfirm: () => void; onCancel: () => void; busy: boolean; confirmLabel: string; disabled?: boolean }) => (
  <div className="flex gap-2 pt-2">
    <button onClick={onConfirm} disabled={busy || disabled} className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition text-sm">{busy ? 'Working…' : confirmLabel}</button>
    <button onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 px-4 rounded-xl transition text-sm">Cancel</button>
  </div>
);
