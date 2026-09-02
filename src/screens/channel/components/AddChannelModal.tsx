import React, { useState } from 'react';
import { 
  X, AlertCircle, CheckCircle2, ArrowRight, Loader2, 
  ExternalLink, Building2, KeyRound 
} from 'lucide-react';
import { 
  CHANNEL_TYPES, getChannelMetadata, addChannel,
  type ChannelConnection 
} from '@/lib/api-channel';

interface AddChannelModalProps {
  existingConnections: ChannelConnection[];
  onClose: () => void;
  onSuccess: (newChannel?: ChannelConnection) => void;
  onOpenExisting: (channelId: string) => void;
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({
  existingConnections,
  onClose,
  onSuccess,
  onOpenExisting
}) => {
  const [channelType, setChannelType] = useState('');
  const [externalPropertyId, setExternalPropertyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter out any internal/deprecated types from catalog
  const availableChannels = CHANNEL_TYPES.filter(c => c.type !== 'aiosell');

  // Check if selected channel already exists
  const existingChannel = channelType 
    ? existingConnections.find(c => c.channel_type.toLowerCase() === channelType.toLowerCase())
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelType) return;

    if (existingChannel) {
      // Do not allow duplicate submission; redirect to existing channel
      onOpenExisting(existingChannel.id);
      return;
    }

    const meta = getChannelMetadata(channelType);
    setLoading(true);
    setError(null);

    try {
      const result = await addChannel(channelType, meta.label, externalPropertyId.trim() || undefined);
      onSuccess(result);
    } catch (err: any) {
      // Handle structured 409 conflict
      if (err?.message && err.message.includes('already added')) {
        setError('This channel is already configured for this hotel.');
      } else {
        setError(err.message || 'Failed to add channel connection. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div 
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col border border-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Channel</h2>
            <p className="text-xs text-slate-400 mt-0.5">Connect a new Online Travel Agency (OTA) distribution channel</p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={loading}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to add channel</p>
                <p className="mt-0.5 text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Channel Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Channel / OTA <span className="text-red-500">*</span>
            </label>
            <select
              value={channelType}
              onChange={(e) => {
                setChannelType(e.target.value);
                setError(null);
              }}
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white text-slate-800"
              required
            >
              <option value="">Select Channel ▼</option>
              {availableChannels.map(c => {
                const isAdded = existingConnections.some(ec => ec.channel_type.toLowerCase() === c.type.toLowerCase());
                return (
                  <option key={c.type} value={c.type}>
                    {c.label} {isAdded ? '(Already Configured)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* DUPLICATE CHANNEL DETECTION BANNER (Phase 4 & 15) */}
          {existingChannel ? (
            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-xs space-y-3 animate-fade-in">
              <div className="flex items-start gap-2.5 text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-amber-900">
                    {existingChannel.channel_name || getChannelMetadata(channelType).label} is already configured
                  </p>
                  <p className="mt-0.5 text-amber-700">
                    This hotel already has an active connection setup for this channel. You can view its details, update mapping, or reconfigure it directly.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-amber-200/60 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenExisting(existingChannel.id)}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Existing Channel
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-800 font-semibold rounded-lg transition text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* External Property ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>External Property ID</span>
                  <span className="text-slate-400 font-normal text-[11px]">(Provided by OTA extranet)</span>
                </label>
                <input
                  type="text"
                  value={externalPropertyId}
                  onChange={(e) => setExternalPropertyId(e.target.value)}
                  disabled={loading}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  placeholder="e.g. 47378196 or Property Code"
                />
              </div>

              {/* Connection Status Indicator */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Initial Connection Status
                </label>
                <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-xs flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="font-medium text-slate-700">Awaiting activation</span>
                  <span className="text-slate-400 text-[11px] ml-auto">Pending room & rate mapping</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !channelType}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue hover:shadow-md transition flex items-center gap-2 disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Add Channel
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
