import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Users, Phone, Mail, Loader2, AlertCircle, X, Building2 } from 'lucide-react';
import type { ReservationGroup, Reservation } from '@/lib/types-reservations';
import { getReservationGroups, getGroupReservations } from '@/lib/api-reservations';
import { GroupBookingModal } from './GroupBookingModal';

export const GroupBookingsScreen = ({ onBack }: { onBack: () => void }) => {
  const [groups, setGroups] = useState<ReservationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupReservations, setGroupReservations] = useState<Reservation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReservationGroups();
      setGroups(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleExpand = async (groupId: string) => {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(groupId);
    try {
      const reservations = await getGroupReservations(groupId);
      setGroupReservations(reservations);
    } catch { /* ignore */ }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-navy-800">Group Bookings</h1>
            <p className="text-xs text-slate-400">{groups.length} groups · Multi-room reservations</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl">
          <Plus className="w-4 h-4" /> New Group Booking
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No group bookings yet. Create one to book multiple rooms under a single confirmation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <button onClick={() => handleExpand(g.id)} className="w-full p-4 text-left hover:bg-slate-50 transition">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-navy-800">{g.group_name || 'Unnamed Group'}</p>
                      <p className="text-xs text-slate-400">{g.confirmation_number} · {fmtDate(g.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-bold text-brand-navy-700">{g.total_rooms} rooms</span>
                    <span>·</span>
                    <span>{g.total_guests} guests</span>
                    {g.contact_person && <span>· {g.contact_person}</span>}
                  </div>
                </div>
              </button>
              {expandedGroup === g.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {g.contact_phone && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400" /> {g.contact_phone}</p>}
                    {g.contact_email && <p className="text-xs text-slate-600 flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400" /> {g.contact_email}</p>}
                  </div>
                  {g.notes && <p className="text-xs text-slate-500 italic mb-3">{g.notes}</p>}
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Rooms in this group</p>
                  <div className="space-y-1.5">
                    {groupReservations.map((r) => (
                      <div key={r.id} className="bg-white rounded-lg border border-slate-200 p-2.5 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-semibold text-brand-navy-700">{r.guest_name} · Room {r.room_no}</p>
                          <p className="text-xs text-slate-400">{r.check_in_date} → {r.check_out_date} · {r.nights} nights · ₹{r.rate}/night</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          r.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' :
                          r.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                          r.status === 'checked_out' ? 'bg-slate-100 text-slate-600' :
                          'bg-red-100 text-red-700'
                        }`}>{r.status.replace('_', ' ')}</span>
                      </div>
                    ))}
                    {groupReservations.length === 0 && <p className="text-xs text-slate-400">No reservations linked.</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <GroupBookingModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
};
