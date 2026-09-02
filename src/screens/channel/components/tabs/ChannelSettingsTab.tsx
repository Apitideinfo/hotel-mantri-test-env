import React, { useState } from 'react';
import { 
  KeyRound, Save, Trash2, AlertTriangle, CheckCircle2, 
  Loader2, Power, Building2 
} from 'lucide-react';
import type { ChannelConnection } from '@/lib/api-channel';
import { updateChannel, deleteChannel } from '@/lib/api-channel';

interface ChannelSettingsTabProps {
  channel: ChannelConnection;
  onRefresh: () => void;
  onClose: () => void;
}

export const ChannelSettingsTab: React.FC<ChannelSettingsTabProps> = ({
  channel,
  onRefresh,
  onClose
}) => {
  const [externalId, setExternalId] = useState(channel.external_channel_id || '');
  const [isEnabled, setIsEnabled] = useState(channel.is_enabled !== false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await updateChannel(channel.id, {
        externalChannelId: externalId.trim() || null,
        isEnabled
      });
      setFeedback({ type: 'success', message: 'Channel settings updated successfully.' });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update channel settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteChannel(channel.id);
      onRefresh();
      onClose();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to disconnect channel.' });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl animate-fade-in">
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

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-brand-600" />
          Channel Connection Parameters
        </h3>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              External Property ID / Channel Extranet Hotel ID
            </label>
            <input
              type="text"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="e.g. 47378196"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 text-slate-800"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Used to identify your property on the OTA's backend extranet.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300"
              />
              <div>
                <span className="font-semibold text-slate-800">Enable Distribution to this Channel</span>
                <p className="text-[11px] text-slate-400">
                  When disabled, inventory and rates will not be pushed to this channel.
                </p>
              </div>
            </label>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Parameters
          </button>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5 space-y-3">
        <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider">Disconnect Channel</h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          Disconnecting will remove this channel connection and its associated room/rate mappings from Hotel Mantri. Historical reservation data will remain preserved.
        </p>

        {confirmDelete ? (
          <div className="p-3 bg-white border border-red-300 rounded-xl space-y-3">
            <p className="text-xs text-red-700 font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Are you sure you want to disconnect this channel?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
            Disconnect Channel
          </button>
        )}
      </div>
    </div>
  );
};
