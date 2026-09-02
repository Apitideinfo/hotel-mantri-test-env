import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, Save, Sparkles, 
  RefreshCw, Loader2, BedDouble, ArrowRight, HelpCircle 
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import { 
  fetchChannelMappings, saveChannelMappings, 
  fetchChannelMapping 
} from '@/lib/api-channel';

interface ChannelRoomMappingTabProps {
  channel: ChannelConnection;
  categories: RoomCategory[];
  mappings: ChannelRateMapping[];
  onRefresh: () => void;
}

interface ExternalRoomOption {
  roomId: string;
  roomName: string;
}

export const ChannelRoomMappingTab: React.FC<ChannelRoomMappingTabProps> = ({
  channel,
  categories,
  mappings,
  onRefresh
}) => {
  // Local state for categoryId -> externalRoomCode mapping
  const [roomMappingState, setRoomMappingState] = useState<Record<string, { code: string; name: string }>>({});
  const [externalRooms, setExternalRooms] = useState<ExternalRoomOption[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [autoMatchConfirm, setAutoMatchConfirm] = useState<{ categoryId: string; externalCode: string; externalName: string }[] | null>(null);

  // Initialize mapping from existing DB mappings
  useEffect(() => {
    const initial: Record<string, { code: string; name: string }> = {};
    const relevant = mappings.filter(
      m => m.channel_connection_id === channel.id || (!m.channel_connection_id && channel.channel_type === 'agoda')
    );

    relevant.forEach(m => {
      if (m.room_category_id && m.external_room_code) {
        initial[m.room_category_id] = {
          code: m.external_room_code,
          name: m.external_room_name || m.external_room_code
        };
      }
    });

    setRoomMappingState(initial);
  }, [mappings, channel.id, channel.channel_type]);

  // Fetch available external rooms from live integration
  const loadExternalRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetchChannelMapping();
      if (res && Array.isArray(res.rooms)) {
        setExternalRooms(res.rooms.map((r: any) => ({
          roomId: r.room_id || r.roomId || r.roomCode || '',
          roomName: r.room_name || r.roomName || r.room_id || 'Room'
        })));
      }
    } catch (err) {
      console.warn('Could not fetch upstream external rooms, fallback to manual entry:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    loadExternalRooms();
  }, []);

  const handleRoomChange = (categoryId: string, selectedCode: string) => {
    const opt = externalRooms.find(r => r.roomId === selectedCode);
    setRoomMappingState(prev => ({
      ...prev,
      [categoryId]: {
        code: selectedCode,
        name: opt ? opt.roomName : selectedCode
      }
    }));
    setFeedback(null);
  };

  // Intelligent Auto Match
  const handleAutoMatch = () => {
    const proposed: { categoryId: string; externalCode: string; externalName: string }[] = [];

    categories.forEach(cat => {
      // Normalize category name
      const normCatName = cat.name.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Try exact name match
      let match = externalRooms.find(er => er.roomName.toLowerCase() === cat.name.toLowerCase());

      // Try normalized name match
      if (!match) {
        match = externalRooms.find(er => {
          const normExt = er.roomName.toLowerCase().replace(/[^a-z0-9]/g, '');
          return normExt === normCatName || normExt.includes(normCatName) || normCatName.includes(normExt);
        });
      }

      if (match) {
        proposed.push({
          categoryId: cat.id,
          externalCode: match.roomId,
          externalName: match.roomName
        });
      }
    });

    if (proposed.length === 0) {
      setFeedback({ type: 'error', message: 'No confident automated room matches found. Please map manually.' });
      return;
    }

    setAutoMatchConfirm(proposed);
  };

  const applyAutoMatch = () => {
    if (!autoMatchConfirm) return;
    const next = { ...roomMappingState };
    autoMatchConfirm.forEach(p => {
      next[p.categoryId] = { code: p.externalCode, name: p.externalName };
    });
    setRoomMappingState(next);
    setAutoMatchConfirm(null);
    setFeedback({ type: 'success', message: `Applied ${autoMatchConfirm.length} room matches. Remember to Save Mapping!` });
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const recordsToSave = categories.map(cat => {
        const mapped = roomMappingState[cat.id];
        return {
          roomCategoryId: cat.id,
          externalRoomCode: mapped?.code || null,
          externalRoomName: mapped?.name || null,
          status: mapped?.code ? 'mapped' : 'unmapped',
          isActive: true
        };
      });

      await saveChannelMappings(channel.id, recordsToSave);
      setFeedback({ type: 'success', message: 'Room mappings saved successfully!' });
      onRefresh();
    } catch (err: any) {
      console.error('Save mapping error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to save room mappings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Action header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 border border-slate-200 rounded-2xl">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Room Category Mapping</h4>
          <p className="text-xs text-slate-500">Map Hotel Mantri room categories to external OTA rooms for availability distribution.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadExternalRooms}
            disabled={loadingRooms}
            className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
            Refresh External Rooms
          </button>

          <button
            type="button"
            onClick={handleAutoMatch}
            className="px-3 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            Auto Match
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Mapping
          </button>
        </div>
      </div>

      {/* Auto Match Confirmation Preview Modal */}
      {autoMatchConfirm && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-3 animate-fade-in text-xs">
          <div className="flex items-center gap-2 text-purple-900 font-bold">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Proposed Auto-Matches ({autoMatchConfirm.length} rooms)
          </div>
          <p className="text-purple-700">Review the matched pairs below before confirming:</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {autoMatchConfirm.map(m => {
              const cat = categories.find(c => c.id === m.categoryId);
              return (
                <div key={m.categoryId} className="p-2 bg-white rounded-lg border border-purple-100 flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{cat?.name}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold text-purple-700">{m.externalName} ({m.externalCode})</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setAutoMatchConfirm(null)}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyAutoMatch}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold shadow-sm"
            >
              Confirm & Apply
            </button>
          </div>
        </div>
      )}

      {/* Mapping Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
              <th className="py-3 px-4">Hotel Mantri Room Category</th>
              <th className="py-3 px-4">Physical Inventory</th>
              <th className="py-3 px-4">OTA Extranet Room</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((cat) => {
              const mapping = roomMappingState[cat.id];
              const isMapped = Boolean(mapping?.code);

              return (
                <tr key={cat.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <BedDouble className="w-4 h-4 text-slate-400" />
                      <div>
                        <p>{cat.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono font-normal">ID: {cat.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 text-slate-600">
                    Active Category
                  </td>

                  <td className="py-3.5 px-4">
                    {externalRooms.length > 0 ? (
                      <select
                        value={mapping?.code || ''}
                        onChange={(e) => handleRoomChange(cat.id, e.target.value)}
                        className="w-full max-w-xs px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="">-- Select OTA Room --</option>
                        {externalRooms.map(er => (
                          <option key={er.roomId} value={er.roomId}>
                            {er.roomName} ({er.roomId})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={mapping?.code || ''}
                        onChange={(e) => handleRoomChange(cat.id, e.target.value)}
                        placeholder="Enter external room code"
                        className="w-full max-w-xs px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-brand-500"
                      />
                    )}
                  </td>

                  <td className="py-3.5 px-4">
                    {isMapped ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Mapped
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                        <AlertTriangle className="w-3 h-3 text-orange-600" />
                        Needs mapping
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
