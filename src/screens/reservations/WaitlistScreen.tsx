import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Plus, X, Loader2, AlertCircle, Trash2, Bell, CheckCircle2,
  Clock, Phone, User, Calendar, BedDouble,
} from 'lucide-react';
import type { WaitlistEntry, WaitlistStatus } from '@/lib/types-reservations';
import { getWaitlist, addToWaitlist, updateWaitlistStatus, deleteWaitlistEntry, checkWaitlistAvailability } from '@/lib/api-reservations';

const STATUS_COLORS: Record<WaitlistStatus, string> = {
  'waiting': 'bg-amber-100 text-amber-700',
  'notified': 'bg-blue-100 text-blue-700',
  'converted': 'bg-emerald-100 text-emerald-700',
  'cancelled': 'bg-red-100 text-red-700',
};

const fmtDate = (d: string): string => {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export const WaitlistScreen = ({ onBack }: { onBack: () => void }) => {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<WaitlistEntry>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<WaitlistStatus | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWaitlist(filter || undefined);
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.guest_name?.trim()) { setError('Guest name is required.'); return; }
    if (!form.check_in || !form.check_out) { setError('Check-in and check-out dates are required.'); return; }
    setSaving(true);
    try {
      await addToWaitlist({
        guest_name: form.guest_name,
        guest_phone: form.guest_phone ?? '',
        check_in: form.check_in,
        check_out: form.check_out,
        room_category: form.room_category ?? '',
        rate: form.rate ?? 0,
        notes: form.notes ?? '',
      });
      setShowForm(false);
      setForm({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckAvailability = async () => {
    setSaving(true);
    try {
      const notified = await checkWaitlistAvailability();
      if (notified.length > 0) {
        await load();
        setError(`${notified.length} guest(s) notified of availability.`);
      } else {
        setError('No rooms available for waitlisted guests yet.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const emptyForm: Partial<WaitlistEntry> = { guest_name: '', guest_phone: '', check_in: '', check_out: '', room_category: '', rate: 0, notes: '' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Waitlist</h1>
            <p className="text-xs text-slate-400">{entries.length} entries</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCheckAvailability} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50">
            <Bell className="w-4 h-4" /> Check Availability
          </button>
          <button onClick={() => { setForm(emptyForm); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
            <Plus className="w-4 h-4" /> Add to Waitlist
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(['', 'waiting', 'notified', 'converted', 'cancelled'] as (WaitlistStatus | '')[]).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize ${filter === s ? 'bg-white text-brand-navy-800 shadow-sm' : 'text-slate-500'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-800">Add to Waitlist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Guest Name *</label>
              <input type="text" value={form.guest_name ?? ''} onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Mobile</label>
              <input type="text" value={form.guest_phone ?? ''} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Room Category</label>
              <input type="text" value={form.room_category ?? ''} onChange={(e) => setForm({ ...form, room_category: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Check-in *</label>
              <input type="date" value={form.check_in ?? ''} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Check-out *</label>
              <input type="date" value={form.check_out ?? ''} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Rate (₹)</label>
              <input type="number" value={form.rate ?? 0} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
              {saving ? 'Adding…' : 'Add to Waitlist'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No waitlist entries.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entries.map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-brand-navy-800">{e.guest_name}</p>
                  <p className="text-xs text-slate-400">{e.guest_phone || 'No phone'}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status]}`}>
                  {e.status}
                </span>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-slate-400" /> {fmtDate(e.check_in)} — {fmtDate(e.check_out)}</p>
                <p className="flex items-center gap-1.5"><BedDouble className="w-3 h-3 text-slate-400" /> {e.room_category || 'Any category'}</p>
                <p className="flex items-center gap-1.5"><User className="w-3 h-3 text-slate-400" /> {e.adults} adults</p>
                {e.rate > 0 && <p className="font-semibold text-slate-700">₹{e.rate}/night · {e.nights} nights</p>}
                {e.notes && <p className="text-slate-500 italic">{e.notes}</p>}
                {e.notified_at && <p className="text-[10px] text-blue-600 flex items-center gap-1"><Bell className="w-2.5 h-2.5" /> Notified {new Date(e.notified_at).toLocaleDateString('en-IN')}</p>}
              </div>
              <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
                {e.status === 'waiting' && (
                  <button onClick={async () => { await updateWaitlistStatus(e.id, 'notified'); await load(); }}
                    className="flex-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 py-1.5 rounded-lg">
                    <Bell className="w-3 h-3 inline mr-1" /> Notify
                  </button>
                )}
                {e.status === 'notified' && (
                  <button onClick={async () => { await updateWaitlistStatus(e.id, 'converted'); await load(); }}
                    className="flex-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 py-1.5 rounded-lg">
                    <CheckCircle2 className="w-3 h-3 inline mr-1" /> Convert
                  </button>
                )}
                {(e.status === 'waiting' || e.status === 'notified') && (
                  <button onClick={async () => { await updateWaitlistStatus(e.id, 'cancelled'); await load(); }}
                    className="flex-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 py-1.5 rounded-lg">
                    Cancel
                  </button>
                )}
                <button onClick={async () => { await deleteWaitlistEntry(e.id); await load(); }}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
