import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Phone, Mail, MapPin, Globe, CreditCard, Building2, Star,
  Calendar, BedDouble, IndianRupee, TrendingUp, Clock, X, Plus, Trash2,
  Upload, FileText, Award, Gift, Cake, Heart, Tag, User, Save, AlertCircle,
  Sparkles, CheckCircle2, Loader2,
} from 'lucide-react';
import type { Guest, GuestPreferences, GuestNote, GuestDocument, GuestStay, GuestStats, LoyaltyTransaction } from '@/lib/types-crm';
import { VIP_TYPES, LOYALTY_LEVELS, GUEST_TAGS, DOC_TYPES, VIP_BADGE_COLORS, LOYALTY_COLORS, LOYALTY_THRESHOLDS } from '@/lib/types-crm';
import {
  getGuestById, saveGuest, getGuestPreferences, saveGuestPreferences,
  getGuestNotes, addGuestNote, deleteGuestNote,
  getGuestDocuments, addGuestDocument, deleteGuestDocument,
  getGuestStays, getGuestStats, getLoyaltyTransactions, redeemLoyaltyPoints,
} from '@/lib/api-crm';

interface Guest360Props {
  guestId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'stays' | 'preferences' | 'notes' | 'documents' | 'loyalty';

const fmtDate = (d: string | null): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtMoney = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const Guest360 = ({ guestId, onBack }: Guest360Props) => {
  const [guest, setGuest] = useState<Guest | null>(null);
  const [prefs, setPrefs] = useState<GuestPreferences | null>(null);
  const [notes, setNotes] = useState<GuestNote[]>([]);
  const [documents, setDocuments] = useState<GuestDocument[]>([]);
  const [stays, setStays] = useState<GuestStay[]>([]);
  const [stats, setStats] = useState<GuestStats | null>(null);
  const [loyaltyTx, setLoyaltyTx] = useState<LoyaltyTransaction[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Guest>>({});
  const [prefForm, setPrefForm] = useState<Partial<GuestPreferences>>({});
  const [newNote, setNewNote] = useState('');
  const [showRedeemBox, setShowRedeemBox] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [redeemDesc, setRedeemDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, p, n, d, s, st, lt] = await Promise.all([
        getGuestById(guestId),
        getGuestPreferences(guestId),
        getGuestNotes(guestId),
        getGuestDocuments(guestId),
        getGuestStays(guestId),
        getGuestStats(guestId),
        getLoyaltyTransactions(guestId),
      ]);
      setGuest(g);
      setPrefs(p);
      setNotes(n);
      setDocuments(d);
      setStays(s);
      setStats(st);
      setLoyaltyTx(lt);
      setEditForm(g ?? {});
      setPrefForm(p ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guest');
    } finally {
      setLoading(false);
    }
  }, [guestId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveGuest = async () => {
    setSaving(true);
    try {
      const updated = await saveGuest(editForm, guestId);
      setGuest(updated);
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrefs = async () => {
    setSaving(true);
    try {
      await saveGuestPreferences(guestId, prefForm);
      const updated = await getGuestPreferences(guestId);
      setPrefs(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      const n = await addGuestNote(guestId, newNote.trim());
      setNotes((prev) => [n, ...prev]);
      setNewNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleAddDoc = async (docType: string, docUrl: string) => {
    try {
      const d = await addGuestDocument(guestId, docType, docUrl);
      setDocuments((prev) => [d, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  const handleRedeem = async () => {
    setSaving(true);
    try {
      await redeemLoyaltyPoints(guestId, redeemPoints, redeemDesc);
      setShowRedeemBox(false);
      setRedeemPoints(0);
      setRedeemDesc('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redeem failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading guest profile…
      </div>
    );
  }

  if (!guest) {
    return <div className="p-4 text-center text-slate-400">Guest not found.</div>;
  }

  const vipBadge = guest.vip_type ? VIP_BADGE_COLORS[guest.vip_type] : '';
  const loyaltyColor = LOYALTY_COLORS[guest.loyalty_level];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-brand-navy-700 to-brand-600 px-5 py-4 flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
            {guest.photo_url ? (
              <img src={guest.photo_url} alt={guest.name} className="w-14 h-14 rounded-full object-cover" />
            ) : (
              guest.name.charAt(0).toUpperCase() || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white">{guest.name || 'Unknown Guest'}</h1>
              {guest.vip_type && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${vipBadge}`}>
                  {guest.vip_type}
                </span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${loyaltyColor}`}>
                {guest.loyalty_level} · {guest.loyalty_points} pts
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-brand-navy-200 mt-1 flex-wrap">
              {guest.mobile && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {guest.mobile}</span>}
              {guest.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {guest.email}</span>}
              {guest.company_name && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {guest.company_name}</span>}
            </div>
          </div>
          {!editMode ? (
            <button onClick={() => { setEditMode(true); setEditForm(guest); }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-white/20 hover:bg-white/30 rounded-lg transition">
              Edit
            </button>
          ) : (
            <button onClick={handleSaveGuest} disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {/* Tags */}
        {guest.tags.length > 0 && (
          <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3 h-3 text-slate-400" />
            {guest.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{t}</span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {(['overview', 'stays', 'preferences', 'notes', 'documents', 'loyalty'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition capitalize whitespace-nowrap ${tab === t ? 'bg-white text-brand-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Stats grid */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={BedDouble} label="Total Stays" value={stats.totalStays.toString()} color="text-brand-600 bg-brand-50" />
              <StatCard icon={Clock} label="Total Nights" value={stats.totalNights.toString()} color="text-sky-600 bg-sky-50" />
              <StatCard icon={IndianRupee} label="Total Revenue" value={fmtMoney(stats.totalRevenue)} color="text-emerald-600 bg-emerald-50" />
              <StatCard icon={TrendingUp} label="Avg Room Rate" value={fmtMoney(stats.avgRoomRate)} color="text-violet-600 bg-violet-50" />
              <StatCard icon={Calendar} label="Last Stay" value={fmtDate(stats.lastStay)} color="text-amber-600 bg-amber-50" />
              <StatCard icon={Calendar} label="Next Booking" value={fmtDate(stats.nextBooking)} color="text-teal-600 bg-teal-50" />
              <StatCard icon={X} label="Cancellations" value={stats.cancellationCount.toString()} color="text-red-600 bg-red-50" />
              <StatCard icon={AlertCircle} label="No Shows" value={stats.noShowCount.toString()} color="text-orange-600 bg-orange-50" />
            </div>
          )}

          {/* Profile details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-brand-navy-800 mb-3">Profile Details</h3>
            {editMode ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditField label="Name" value={editForm.name ?? ''} onChange={(v) => setEditForm({ ...editForm, name: v })} />
                <EditField label="Mobile" value={editForm.mobile ?? ''} onChange={(v) => setEditForm({ ...editForm, mobile: v })} />
                <EditField label="Email" value={editForm.email ?? ''} onChange={(v) => setEditForm({ ...editForm, email: v })} />
                <EditField label="Address" value={editForm.address ?? ''} onChange={(v) => setEditForm({ ...editForm, address: v })} />
                <EditField label="Nationality" value={editForm.nationality ?? ''} onChange={(v) => setEditForm({ ...editForm, nationality: v })} />
                <EditField label="ID Proof Type" value={editForm.id_proof_type ?? ''} onChange={(v) => setEditForm({ ...editForm, id_proof_type: v })} />
                <EditField label="ID Proof Number" value={editForm.id_proof_number ?? ''} onChange={(v) => setEditForm({ ...editForm, id_proof_number: v })} />
                <EditField label="GST Number" value={editForm.gst_number ?? ''} onChange={(v) => setEditForm({ ...editForm, gst_number: v })} />
                <EditField label="Company Name" value={editForm.company_name ?? ''} onChange={(v) => setEditForm({ ...editForm, company_name: v })} />
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">VIP Type</label>
                  <select value={editForm.vip_type ?? ''} onChange={(e) => setEditForm({ ...editForm, vip_type: e.target.value as Guest['vip_type'] })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                    {VIP_TYPES.map((v) => <option key={v} value={v}>{v || 'None'}</option>)}
                  </select>
                </div>
                <EditField label="Date of Birth" value={editForm.date_of_birth ?? ''} onChange={(v) => setEditForm({ ...editForm, date_of_birth: v })} type="date" />
                <EditField label="Anniversary" value={editForm.anniversary ?? ''} onChange={(v) => setEditForm({ ...editForm, anniversary: v })} type="date" />
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500 mb-1 block">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {GUEST_TAGS.map((t) => {
                      const selected = (editForm.tags ?? []).includes(t);
                      return (
                        <button key={t} onClick={() => {
                          const tags = editForm.tags ?? [];
                          setEditForm({ ...editForm, tags: selected ? tags.filter((x) => x !== t) : [...tags, t] });
                        }}
                          className={`text-[10px] px-2 py-1 rounded-full font-medium transition ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoRow icon={User} label="Name" value={guest.name} />
                <InfoRow icon={Phone} label="Mobile" value={guest.mobile} />
                <InfoRow icon={Mail} label="Email" value={guest.email} />
                <InfoRow icon={MapPin} label="Address" value={guest.address} />
                <InfoRow icon={Globe} label="Nationality" value={guest.nationality} />
                <InfoRow icon={CreditCard} label="ID Proof" value={`${guest.id_proof_type} ${guest.id_proof_number}`.trim() || '—'} />
                <InfoRow icon={Building2} label="Company" value={guest.company_name} />
                <InfoRow icon={Star} label="GST Number" value={guest.gst_number} />
                <InfoRow icon={Cake} label="Birthday" value={fmtDate(guest.date_of_birth)} />
                <InfoRow icon={Heart} label="Anniversary" value={fmtDate(guest.anniversary)} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stays Tab */}
      {tab === 'stays' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {stays.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No stay history yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                    <th className="px-4 py-3">Room</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th>
                    <th className="px-4 py-3">Nights</th>
                    <th className="px-4 py-3">Revenue</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stays.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-brand-navy-700">{s.room_no}</td>
                      <td className="px-4 py-3 text-slate-600">{s.category || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(s.check_in)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(s.check_out)}</td>
                      <td className="px-4 py-3 tabular-nums">{s.nights}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{fmtMoney(Number(s.revenue))}</td>
                      <td className="px-4 py-3 text-slate-600">{s.booking_source || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          s.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                          s.payment_status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{s.payment_status || '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preferences Tab */}
      {tab === 'preferences' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Smoking Preference</label>
              <select value={prefForm.smoking ?? 'Non Smoking'} onChange={(e) => setPrefForm({ ...prefForm, smoking: e.target.value as GuestPreferences['smoking'] })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="Non Smoking">Non Smoking</option>
                <option value="Smoking">Smoking</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Room Temperature</label>
              <select value={prefForm.room_temperature ?? 'Normal'} onChange={(e) => setPrefForm({ ...prefForm, room_temperature: e.target.value as GuestPreferences['room_temperature'] })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="Cool">Cool</option>
                <option value="Normal">Normal</option>
                <option value="Warm">Warm</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Meal Preference</label>
              <input type="text" value={prefForm.meal_preference ?? ''} onChange={(e) => setPrefForm({ ...prefForm, meal_preference: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Favourite Room</label>
              <input type="text" value={prefForm.favourite_room ?? ''} onChange={(e) => setPrefForm({ ...prefForm, favourite_room: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Favourite Category</label>
              <input type="text" value={prefForm.favourite_category ?? ''} onChange={(e) => setPrefForm({ ...prefForm, favourite_category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Toggle label="High Floor" checked={prefForm.high_floor ?? false} onChange={(v) => setPrefForm({ ...prefForm, high_floor: v })} />
            <Toggle label="Near Lift" checked={prefForm.near_lift ?? false} onChange={(v) => setPrefForm({ ...prefForm, near_lift: v })} />
            <Toggle label="Extra Pillow" checked={prefForm.extra_pillow ?? false} onChange={(v) => setPrefForm({ ...prefForm, extra_pillow: v })} />
            <Toggle label="Extra Bed" checked={prefForm.extra_bed ?? false} onChange={(v) => setPrefForm({ ...prefForm, extra_bed: v })} />
          </div>
          <button onClick={handleSavePrefs} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* Notes Tab */}
      {tab === 'notes' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex gap-2">
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add internal note (staff only)…"
                onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <button onClick={handleAddNote} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          {notes.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">No notes yet.</div>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-sm text-slate-700">{n.note}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {n.created_by && `By ${n.created_by} · `}{new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button onClick={() => { deleteGuestNote(n.id); setNotes((prev) => prev.filter((x) => x.id !== n.id)); }}
                    className="p-1 text-slate-300 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div className="space-y-3">
          <DocumentUploader onUpload={handleAddDoc} />
          {documents.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">No documents uploaded.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {documents.map((d) => (
                <div key={d.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{d.doc_type}</p>
                    <p className="text-[10px] text-slate-400">{new Date(d.uploaded_at).toLocaleDateString('en-IN')}</p>
                  </div>
                  {d.doc_url && (
                    <a href={d.doc_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-brand-600 transition">
                      <Upload className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={() => { deleteGuestDocument(d.id); setDocuments((prev) => prev.filter((x) => x.id !== d.id)); }}
                    className="p-1.5 text-slate-300 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loyalty Tab */}
      {tab === 'loyalty' && (
        <div className="space-y-4">
          {/* Loyalty summary */}
          <div className="bg-gradient-to-r from-brand-navy-700 to-brand-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-brand-navy-200 uppercase tracking-wider">Current Level</p>
                <p className="text-2xl font-bold">{guest.loyalty_level}</p>
              </div>
              <Award className="w-10 h-10 text-brand-gold-400" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-brand-navy-200">Available Points</p>
                <p className="text-xl font-bold tabular-nums">{guest.loyalty_points}</p>
              </div>
              <button onClick={() => setShowRedeemBox(true)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-white/20 hover:bg-white/30 rounded-lg transition">
                Redeem Points
              </button>
            </div>
            {/* Progress to next level */}
            {guest.loyalty_level !== 'Diamond' && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-brand-navy-200 mb-1">
                  <span>{guest.loyalty_level}</span>
                  <span>{Object.entries(LOYALTY_THRESHOLDS).find(([level]) => LOYALTY_LEVELS.indexOf(level as typeof guest.loyalty_level) > LOYALTY_LEVELS.indexOf(guest.loyalty_level))?.[0] ?? 'Diamond'}</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-gold-400 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (guest.loyalty_points / (Object.entries(LOYALTY_THRESHOLDS).find(([level]) => LOYALTY_LEVELS.indexOf(level as typeof guest.loyalty_level) > LOYALTY_LEVELS.indexOf(guest.loyalty_level))?.[1] ?? guest.loyalty_points)) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Redeem box */}
          {showRedeemBox && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-slate-700">Redeem Points</p>
              <input type="number" value={redeemPoints} onChange={(e) => setRedeemPoints(Number(e.target.value))}
                placeholder="Points to redeem" max={guest.loyalty_points}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input type="text" value={redeemDesc} onChange={(e) => setRedeemDesc(e.target.value)}
                placeholder="Description (e.g. discount on booking)" 
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <div className="flex gap-2">
                <button onClick={handleRedeem} disabled={saving || redeemPoints <= 0 || !redeemDesc.trim()}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
                  Confirm Redeem
                </button>
                <button onClick={() => { setShowRedeemBox(false); setRedeemPoints(0); setRedeemDesc(''); }}
                  className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {/* Transaction history */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-brand-navy-800">Transaction History</h3>
            </div>
            {loyaltyTx.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No loyalty transactions yet.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {loyaltyTx.map((tx) => (
                  <div key={tx.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      tx.transaction_type === 'earn' ? 'bg-emerald-50 text-emerald-600' :
                      tx.transaction_type === 'redeem' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {tx.transaction_type === 'earn' ? <Plus className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700">{tx.description}</p>
                      <p className="text-[10px] text-slate-400">{new Date(tx.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${tx.points > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {tx.points > 0 ? '+' : ''}{tx.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helper Components ──

const StatCard = ({ icon: Icon, label, value, color }: { icon: typeof BedDouble; label: string; value: string; color: string }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
      <Icon className="w-4 h-4" />
    </div>
    <p className="text-lg font-bold text-brand-navy-800 tabular-nums">{value}</p>
    <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
  </div>
);

const InfoRow = ({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: string }) => (
  <div className="flex items-center gap-2.5 py-1.5">
    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-700 truncate">{value || '—'}</p>
    </div>
  </div>
);

const EditField = ({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <div>
    <label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
  </div>
);

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <button onClick={() => onChange(!checked)}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${checked ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition ${checked ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
      {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
    </div>
    <span className="text-xs font-medium">{label}</span>
  </button>
);

const DocumentUploader = ({ onUpload }: { onUpload: (docType: string, docUrl: string) => void }) => {
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docUrl, setDocUrl] = useState('');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <p className="text-sm font-bold text-slate-700">Upload Document</p>
      <div className="flex gap-2">
        <select value={docType} onChange={(e) => setDocType(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input type="text" value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
          placeholder="Document URL (or upload to storage)"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
        <button onClick={() => { if (docUrl.trim()) { onUpload(docType, docUrl.trim()); setDocUrl(''); } }}
          disabled={!docUrl.trim()}
          className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">
          <Upload className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
