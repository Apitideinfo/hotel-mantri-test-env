import { useState } from 'react';
import { X, Plus, Trash2, Users, Building2, Save, Loader2, AlertCircle } from 'lucide-react';
import { createGroupBooking } from '@/lib/api-reservations';

interface GroupBookingModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export const GroupBookingModal = ({ onClose, onSaved }: GroupBookingModalProps) => {
  const [groupName, setGroupName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [rooms, setRooms] = useState([
    { room_no: '', guest_name: '', guest_phone: '', check_in: '', check_out: '', rate: 0, adults: 1 },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRoom = () => {
    setRooms([...rooms, { room_no: '', guest_name: '', guest_phone: '', check_in: rooms[0]?.check_in ?? '', check_out: rooms[0]?.check_out ?? '', rate: 0, adults: 1 }]);
  };

  const removeRoom = (idx: number) => {
    setRooms(rooms.filter((_, i) => i !== idx));
  };

  const updateRoom = (idx: number, field: string, value: string | number) => {
    setRooms(rooms.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setError(null);
    if (!groupName.trim()) { setError('Group name is required.'); return; }
    if (rooms.length === 0) { setError('At least one room is required.'); return; }
    for (let i = 0; i < rooms.length; i++) {
      if (!rooms[i].room_no.trim()) { setError(`Room ${i + 1}: Room number is required.`); return; }
      if (!rooms[i].guest_name.trim()) { setError(`Room ${i + 1}: Guest name is required.`); return; }
      if (!rooms[i].check_in || !rooms[i].check_out) { setError(`Room ${i + 1}: Check-in and check-out dates are required.`); return; }
    }

    setSaving(true);
    try {
      await createGroupBooking({
        group: { group_name: groupName, contact_person: contactPerson, contact_phone: contactPhone, contact_email: contactEmail, notes },
        rooms: rooms.map((r) => ({
          room_no: r.room_no,
          guest_name: r.guest_name,
          guest_phone: r.guest_phone,
          check_in: r.check_in,
          check_out: r.check_out,
          rate: r.rate,
          adults: r.adults,
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-brand-navy-800">Group Booking</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Group details */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Group Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Group Name *</label>
                <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Contact Person</label>
                <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Contact Phone</label>
                <input type="text" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Contact Email</label>
                <input type="text" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
          </div>

          {/* Rooms */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rooms ({rooms.length})</p>
              <button onClick={addRoom} className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                <Plus className="w-3.5 h-3.5" /> Add Room
              </button>
            </div>

            {rooms.map((room, idx) => (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">Room {idx + 1}</span>
                  {rooms.length > 1 && (
                    <button onClick={() => removeRoom(idx)} className="p-1 text-slate-300 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Room No *</label>
                    <input type="text" value={room.room_no} onChange={(e) => updateRoom(idx, 'room_no', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Guest Name *</label>
                    <input type="text" value={room.guest_name} onChange={(e) => updateRoom(idx, 'guest_name', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Phone</label>
                    <input type="text" value={room.guest_phone} onChange={(e) => updateRoom(idx, 'guest_phone', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Check-in *</label>
                    <input type="date" value={room.check_in} onChange={(e) => updateRoom(idx, 'check_in', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Check-out *</label>
                    <input type="date" value={room.check_out} onChange={(e) => updateRoom(idx, 'check_out', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 mb-0.5 block">Rate (₹)</label>
                    <input type="number" value={room.rate} onChange={(e) => updateRoom(idx, 'rate', Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-200 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Group Booking'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-200 rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  );
};
