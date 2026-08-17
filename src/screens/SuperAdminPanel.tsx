import { useEffect, useState, useCallback } from 'react';
import {
  Building2, Plus, Pencil, Power, Check, X, Mail, Users, AlertCircle,
  Shield, LogOut, RefreshCw, KeyRound, CheckCircle2, Database,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

interface HotelRow {
  id: string;
  hotel_name: string;
  owner_name: string;
  admin_email: string;
  mobile: string;
  address: string;
  total_rooms: number;
  plan_id: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  subscription_status: string;
  is_active: boolean;
  created_at: string;
}

interface PlanRow {
  id: string;
  name: string;
  price: number;
  billing_period: string;
  is_active: boolean;
}

interface SuperAdminPanelProps {
  onSignOut: () => void;
  onNavigateDbTools: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const emptyForm = {
  hotel_name: '', owner_name: '', admin_email: '', admin_password: '', mobile: '', address: '',
  total_rooms: 1, plan_id: '', subscription_start: today(),
  subscription_expiry: '', subscription_status: 'Active' as string,
};

export const SuperAdminPanel = ({ onSignOut, onNavigateDbTools }: SuperAdminPanelProps) => {
  const { user } = useAuth();
  const [hotels, setHotels] = useState<HotelRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // For the "Invite/Reset" modal on existing hotels
  const [resetHotel, setResetHotel] = useState<HotelRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, p] = await Promise.all([
        supabase.from('hotels').select('*').order('created_at', { ascending: false }),
        supabase.from('subscription_plans').select('*').order('sort_order', { ascending: true }),
      ]);
      if (h.error) throw h.error;
      if (p.error) throw p.error;
      setHotels((h.data ?? []) as HotelRow[]);
      setPlans((p.data ?? []) as PlanRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = {
    total: hotels.length,
    active: hotels.filter((h) => h.subscription_status === 'Active').length,
    expired: hotels.filter((h) => h.subscription_status === 'Expired').length,
    suspended: hotels.filter((h) => h.subscription_status === 'Suspended').length,
    expiringSoon: hotels.filter((h) => {
      if (!h.subscription_expiry) return false;
      const days = (new Date(h.subscription_expiry).getTime() - Date.now()) / 86400000;
      return days <= 7 && days >= 0;
    }).length,
  };

  const callEdgeFunction = async (payload: Record<string, unknown>) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/setup-super-admin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!form.hotel_name.trim()) { setError('Enter hotel name.'); return; }
    if (!form.admin_email.trim()) { setError('Enter admin email.'); return; }

    const isCreating = !editingId;
    if (isCreating && (!form.admin_password || form.admin_password.length < 6)) {
      setError('Enter a password of at least 6 characters for the hotel admin.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        hotel_name: form.hotel_name.trim(),
        owner_name: form.owner_name.trim(),
        admin_email: form.admin_email.trim(),
        mobile: form.mobile.trim(),
        address: form.address.trim(),
        total_rooms: Math.max(1, form.total_rooms),
        plan_id: form.plan_id || null,
        subscription_start: form.subscription_start || null,
        subscription_expiry: form.subscription_expiry || null,
        subscription_status: form.subscription_status,
      };

      let hotelId: string;

      if (editingId) {
        const { error: e } = await supabase.from('hotels').update(payload).eq('id', editingId);
        if (e) throw e;
        hotelId = editingId;
        setSuccess('Hotel updated successfully.');
      } else {
        const { data, error: e } = await supabase.from('hotels').insert(payload).select('*').single();
        if (e) throw e;
        const newHotel = data as HotelRow;
        hotelId = newHotel.id;

        // Create hotel_settings row for this hotel
        await supabase.from('hotel_settings').insert({
          id: newHotel.id, hotel_name: newHotel.hotel_name, total_rooms: newHotel.total_rooms,
        });
        // Create default booking-source categories for this hotel
        const defaultSources = ['OTA', 'Direct/Walking', 'Corporate/Agent', 'Phonebook'];
        await supabase.from('company_sources').insert(
          defaultSources.map((cat) => ({
            hotel_id: newHotel.id, name: cat, source_category: cat as import('@/lib/types').SourceCategory,
          }))
        );

        // Now create the auth user + link to hotel via edge function
        try {
          await callEdgeFunction({
            action: 'create_hotel_admin',
            email: form.admin_email.trim(),
            password: form.admin_password,
            hotel_id: hotelId,
            role: 'hotel_admin',
          });
          setSuccess(
            `Hotel "${newHotel.hotel_name}" created successfully. ` +
            `Hotel Admin account created for ${form.admin_email.trim()}. ` +
            `They can now sign in with the password you set.`
          );
        } catch (efErr) {
          // Hotel was created but admin account failed
          setSuccess(
            `Hotel "${newHotel.hotel_name}" created successfully. ` +
            `However, the admin account could not be created: ${efErr instanceof Error ? efErr.message : 'Unknown error'}. ` +
            `Use "Invite Admin" to create the account.`
          );
        }
      }

      await load();
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (h: HotelRow) => {
    setEditingId(h.id);
    setForm({
      ...emptyForm,
      hotel_name: h.hotel_name, owner_name: h.owner_name, admin_email: h.admin_email,
      mobile: h.mobile, address: h.address, total_rooms: h.total_rooms,
      plan_id: h.plan_id ?? '', subscription_start: h.subscription_start ?? today(),
      subscription_expiry: h.subscription_expiry ?? '', subscription_status: h.subscription_status,
    });
    setShowForm(true);
    setSuccess(null);
    setError(null);
  };

  const handleToggleStatus = async (h: HotelRow) => {
    const newStatus = h.subscription_status === 'Active' ? 'Suspended' : 'Active';
    try {
      await supabase.from('hotels').update({ subscription_status: newStatus }).eq('id', h.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleInviteAdmin = (h: HotelRow) => {
    setResetHotel(h);
    setResetPassword('');
    setError(null);
    setSuccess(null);
  };

  const handleResetSubmit = async () => {
    if (!resetHotel) return;
    if (!resetPassword || resetPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      setResetting(true);
      await callEdgeFunction({
        action: 'create_hotel_admin',
        email: resetHotel.admin_email,
        password: resetPassword,
        hotel_id: resetHotel.id,
        role: 'hotel_admin',
      });
      setSuccess(
        `Hotel Admin account created/updated for ${resetHotel.admin_email}. ` +
        `They can now sign in with the password you set.`
      );
      setResetHotel(null);
      setResetPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create admin account');
    } finally {
      setResetting(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-slate-900 text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <Shield className="w-5 h-5 text-sky-400" />
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">Super Admin Panel</h1>
          <p className="text-slate-400 text-xs">{user?.email}</p>
        </div>
        <button onClick={onNavigateDbTools} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition">
          <Database className="w-4 h-4" /> DB Tools
        </button>
        <button onClick={onSignOut} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> <span>{success}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total Hotels" value={stats.total} color="bg-sky-50 text-sky-700 border-sky-200" />
          <StatCard label="Active" value={stats.active} color="bg-emerald-50 text-emerald-700 border-emerald-200" />
          <StatCard label="Expired" value={stats.expired} color="bg-amber-50 text-amber-700 border-amber-200" />
          <StatCard label="Suspended" value={stats.suspended} color="bg-red-50 text-red-700 border-red-200" />
          <StatCard label="Expiring Soon" value={stats.expiringSoon} color="bg-orange-50 text-orange-700 border-orange-200" />
          <StatCard label="Active Subs" value={stats.active} color="bg-teal-50 text-teal-700 border-teal-200" />
        </div>

        {/* Add button */}
        {!showForm && (
          <button onClick={() => { setForm(emptyForm); setShowForm(true); setEditingId(null); setSuccess(null); setError(null); }}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3.5 rounded-xl shadow-sm transition">
            <Plus className="w-5 h-5" /> Create New Hotel
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{editingId ? 'Edit Hotel' : 'New Hotel'}</h2>
            </div>
            <div className="p-4 space-y-3">
              <Input label="Hotel Name" value={form.hotel_name} onChange={(v) => setForm({ ...form, hotel_name: v })} />
              <Input label="Owner Name" value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} />
              <Input label="Admin Email" value={form.admin_email} onChange={(v) => setForm({ ...form, admin_email: v })} type="email" />
              {!editingId && (
                <Input label="Admin Password" value={form.admin_password} onChange={(v) => setForm({ ...form, admin_password: v })} type="password" placeholder="Min 6 characters" />
              )}
              <Input label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Total Rooms" value={String(form.total_rooms)} onChange={(v) => setForm({ ...form, total_rooms: parseInt(v || '1', 10) })} type="number" />
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Plan</span>
                  <select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
                    <option value="">— Select —</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name} (₹{p.price})</option>)}
                  </select>
                </label>
              </div>
              <Input label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Sub. Start" value={form.subscription_start} onChange={(v) => setForm({ ...form, subscription_start: v })} type="date" />
                <Input label="Sub. Expiry" value={form.subscription_expiry} onChange={(v) => setForm({ ...form, subscription_expiry: v })} type="date" />
              </div>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Status</span>
                <select value={form.subscription_status} onChange={(e) => setForm({ ...form, subscription_status: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="Active">Active</option>
                  <option value="Expired">Expired</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                  <Check className="w-4 h-4" /> {saving ? 'Creating…' : editingId ? 'Update' : 'Create Hotel'}
                </button>
                <button onClick={handleCancel}
                  className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hotel list */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Hotels ({hotels.length})</h2>
            </div>
            <button onClick={load} className="p-1 text-slate-400 hover:text-sky-600 transition">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 space-y-2">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
            ) : hotels.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No hotels yet. Create one above.</p>
            ) : (
              hotels.map((h) => (
                <div key={h.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">{h.hotel_name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          h.subscription_status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
                          h.subscription_status === 'Expired' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{h.subscription_status}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{h.admin_email}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {h.total_rooms} rooms
                        {h.subscription_expiry ? ` · Expires: ${h.subscription_expiry}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
                    <button onClick={() => handleEdit(h)} className="flex items-center gap-1 text-xs text-sky-700 hover:text-sky-900 transition px-2 py-1">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => handleToggleStatus(h)} className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 transition px-2 py-1">
                      <Power className="w-3 h-3" /> {h.subscription_status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button onClick={() => handleInviteAdmin(h)}
                      className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 transition px-2 py-1">
                      <Mail className="w-3 h-3" /> Invite / Reset
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Reset / Invite modal */}
      {resetHotel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-sky-600" />
              <h3 className="text-base font-bold text-slate-900">Invite / Reset Admin</h3>
            </div>
            <p className="text-sm text-slate-600">
              Set a password for <span className="font-semibold">{resetHotel.admin_email}</span>.
              This will create or reset their account so they can sign in.
            </p>
            <Input label="New Password" value={resetPassword} onChange={setResetPassword} type="password" placeholder="Min 6 characters" />
            <div className="flex gap-2">
              <button onClick={handleResetSubmit} disabled={resetting}
                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition">
                {resetting ? 'Creating…' : 'Create / Reset Account'}
              </button>
              <button onClick={() => { setResetHotel(null); setResetPassword(''); }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className={`rounded-xl p-3 border ${color}`}>
    <p className="text-xs opacity-80">{label}</p>
    <p className="text-xl font-bold tabular-nums">{value}</p>
  </div>
);

const Input = ({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);
