import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Phone, Mail, Building2, Star, X, Loader2, AlertCircle, Users, MessageCircle } from 'lucide-react';
import type { Guest } from '@/lib/types-crm';
import { VIP_BADGE_COLORS, LOYALTY_COLORS, GUEST_TAGS } from '@/lib/types-crm';
import { getGuests, searchGuests, saveGuest, checkDuplicateGuest } from '@/lib/api-crm';
import { Guest360 } from './Guest360';

export const GuestDirectory = ({ onBack }: { onBack: () => void }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Guest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGuests();
      setGuests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) { load(); return; }
    try {
      const results = await searchGuests(q);
      setGuests(results);
    } catch { /* keep current */ }
  };

  if (selectedGuestId) {
    return <Guest360 guestId={selectedGuestId} onBack={() => { setSelectedGuestId(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <X className="w-5 h-5 rotate-45" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Guest Directory</h1>
            <p className="text-xs text-slate-400">{guests.length} guests</p>
          </div>
        </div>
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition">
          <Plus className="w-4 h-4" /> Add Guest
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="text" value={search} onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by name, mobile, email, company, GST, booking ID…"
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
      </div>

      {/* Guest list */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : guests.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No guests found. Add your first guest to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {guests.map((g) => (
            <button key={g.id} onClick={() => setSelectedGuestId(g.id)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left hover:shadow-md hover:-translate-y-0.5 transition">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold shrink-0">
                  {g.name.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-navy-800 truncate">{g.name || 'Unknown'}</p>
                  <p className="text-xs text-slate-400 truncate">{g.mobile || g.email || 'No contact'}</p>
                </div>
                {g.vip_type && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${VIP_BADGE_COLORS[g.vip_type]}`}>
                    {g.vip_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${LOYALTY_COLORS[g.loyalty_level]}`}>
                  {g.loyalty_level} · {g.loyalty_points} pts
                </span>
                {g.company_name && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    <Building2 className="w-2.5 h-2.5" /> {g.company_name}
                  </span>
                )}
              </div>
              {g.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {g.tags.slice(0, 3).map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t}</span>
                  ))}
                </div>
              )}
              {/* Quick action buttons */}
              <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
                {g.mobile && (
                  <a href={`tel:${g.mobile}`} onClick={(e) => e.stopPropagation()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition">
                    <Phone className="w-3 h-3" /> Call
                  </a>
                )}
                {g.mobile && (
                  <a href={`https://wa.me/91${g.mobile.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition">
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </a>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Add Guest Form */}
      {showAddForm && (
        <AddGuestModal
          onClose={() => { setShowAddForm(false); setDuplicateWarning(null); }}
          onSaved={(id) => { setShowAddForm(false); setDuplicateWarning(null); setSelectedGuestId(id); }}
          duplicateWarning={duplicateWarning}
          onClearDuplicate={() => setDuplicateWarning(null)}
          onDuplicateCheck={async (mobile, email) => {
            const result = await checkDuplicateGuest(mobile, email);
            if (result.found && result.guest) {
              setDuplicateWarning(result.guest);
              return true;
            }
            setDuplicateWarning(null);
            return false;
          }}
        />
      )}
    </div>
  );
};

// ── Add Guest Modal with Duplicate Detection ──
const AddGuestModal = ({ onClose, onSaved, duplicateWarning, onDuplicateCheck, onClearDuplicate }: {
  onClose: () => void;
  onSaved: (id: string) => void;
  duplicateWarning: Guest | null;
  onDuplicateCheck: (mobile: string, email: string) => Promise<boolean>;
  onClearDuplicate: () => void;
}) => {
  const [form, setForm] = useState<Partial<Guest>>({ name: '', mobile: '', email: '', address: '', nationality: '', company_name: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useExisting, setUseExisting] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      // Check for duplicates
      const isDup = await onDuplicateCheck(form.mobile ?? '', form.email ?? '');
      if (isDup && !useExisting) return; // Wait for user decision

      const saved = await saveGuest(form);
      onSaved(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy-800">Add New Guest</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3">
          {/* Duplicate warning */}
          {duplicateWarning && !useExisting && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <p className="text-sm font-bold text-amber-700">Existing Guest Found!</p>
              </div>
              <p className="text-xs text-amber-600">
                A guest with this {duplicateWarning.mobile === form.mobile ? 'mobile number' : 'email'} already exists:
              </p>
              <div className="bg-white rounded-lg p-2.5 border border-amber-200">
                <p className="text-sm font-bold text-slate-800">{duplicateWarning.name}</p>
                <p className="text-xs text-slate-500">{duplicateWarning.mobile} · {duplicateWarning.email}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setUseExisting(true)}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg">
                  Use Existing Profile
                </button>
                <button onClick={() => onClearDuplicate()}
                  className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">
                  Create New Anyway
                </button>
              </div>
            </div>
          )}

          {(!duplicateWarning || useExisting || !duplicateWarning.mobile) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name *" value={form.name ?? ''} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Mobile" value={form.mobile ?? ''} onChange={(v) => setForm({ ...form, mobile: v })} />
              <Field label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Nationality" value={form.nationality ?? ''} onChange={(v) => setForm({ ...form, nationality: v })} />
              <Field label="Company" value={form.company_name ?? ''} onChange={(v) => setForm({ ...form, company_name: v })} />
              <Field label="Address" value={form.address ?? ''} onChange={(v) => setForm({ ...form, address: v })} />
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Guest'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
  </div>
);
