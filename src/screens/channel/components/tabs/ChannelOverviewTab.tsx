import React, { useState } from 'react';
import { 
  CheckCircle2, Clock, AlertTriangle, XCircle, RefreshCw, 
  Download, Settings, ArrowRight, BedDouble, Tag, Calendar, 
  ShieldAlert, Power, Loader2, Zap 
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping, ChannelSyncLog } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { syncChannelInventory, syncChannelRates, updateChannel } from '@/lib/api-channel';

interface ChannelOverviewTabProps {
  channel: ChannelConnection;
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  logs: ChannelSyncLog[];
  onOpenFutureBookings: () => void;
  onNavigateToTab: (tab: string) => void;
  onRefresh: () => void;
}

export const ChannelOverviewTab: React.FC<ChannelOverviewTabProps> = ({
  channel,
  categories,
  ratePlans,
  mappings,
  logs,
  onOpenFutureBookings,
  onNavigateToTab,
  onRefresh
}) => {
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Mapped calculations
  const channelMappings = mappings.filter(
    m => m.channel_connection_id === channel.id || (!m.channel_connection_id && channel.channel_type === 'agoda')
  );
  const mappedRoomIds = new Set(channelMappings.filter(m => m.status === 'mapped' && m.room_category_id).map(m => m.room_category_id));
  const mappedRateIds = new Set(channelMappings.filter(m => m.status === 'mapped' && m.rate_plan_id).map(m => m.rate_plan_id));
  
  const mappedRoomsCount = mappedRoomIds.size;
  const totalRooms = categories.length || 0;
  const mappedRatesCount = mappedRateIds.size;
  const totalRates = ratePlans.length || 0;

  // Sync log stats
  const syncErrors = logs.filter(l => l.status === 'failure').length;

  const isEnabled = channel.is_enabled !== false;

  const handleSyncAll = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      
      await Promise.all([
        syncChannelInventory(channel.id, today, future),
        syncChannelRates(channel.id, today, future)
      ]);

      setFeedback({ type: 'success', message: 'Inventory and rates synchronized successfully.' });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Synchronization encountered an issue.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleActive = async () => {
    setToggling(true);
    setFeedback(null);
    try {
      await updateChannel(channel.id, { isEnabled: !isEnabled });
      setFeedback({ 
        type: 'success', 
        message: `Channel connection ${!isEnabled ? 'enabled' : 'disabled'} successfully.` 
      });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update channel status.' });
    } finally {
      setToggling(false);
    }
  };

  const fmtDateTime = (d: string | null) => {
    if (!d) return 'Never';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Alert feedback */}
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

      {/* Primary Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500">Rooms Mapped</span>
            <BedDouble className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xl font-bold text-slate-800">{mappedRoomsCount} / {totalRooms}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {totalRooms > 0 && mappedRoomsCount === totalRooms ? 'All rooms mapped' : `${totalRooms - mappedRoomsCount} pending`}
          </p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500">Rates Mapped</span>
            <Tag className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xl font-bold text-slate-800">{mappedRatesCount} / {totalRates}</span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {totalRates > 0 && mappedRatesCount === totalRates ? 'All plans mapped' : `${totalRates - mappedRatesCount} pending`}
          </p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500">Connection State</span>
            <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>
          <span className="text-xl font-bold text-slate-800 capitalize">
            {isEnabled ? (channel.status === 'error' ? 'Attention' : 'Active') : 'Disabled'}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isEnabled ? 'Live distribution enabled' : 'Distribution stopped'}
          </p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-500">Sync Errors</span>
            <ShieldAlert className={`w-4 h-4 ${syncErrors > 0 ? 'text-red-500' : 'text-slate-400'}`} />
          </div>
          <span className={`text-xl font-bold ${syncErrors > 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {syncErrors}
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {syncErrors === 0 ? 'All syncs passing' : 'Needs attention'}
          </p>
        </div>
      </div>

      {/* Connection & Sync Details Box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-800">Connection Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6 text-xs border-y border-slate-100 py-3">
          <div className="flex justify-between py-1">
            <span className="text-slate-400">External Property ID:</span>
            <span className="font-mono font-semibold text-slate-700">{channel.external_channel_id || 'Not configured'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Last Successful Sync:</span>
            <span className="font-semibold text-slate-700">{fmtDateTime(channel.last_successful_sync_at || channel.last_sync_at)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Mapping Status:</span>
            <span className="font-semibold capitalize text-slate-700">{channel.mapping_status?.replace('_', ' ') || 'Unmapped'}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">Sync Status:</span>
            <span className={`font-semibold capitalize ${channel.last_sync_status === 'failure' ? 'text-red-600' : 'text-emerald-600'}`}>
              {channel.last_sync_status || 'Ready'}
            </span>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncing || !isEnabled}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronizing...' : 'Sync Now'}
          </button>

          <button
            type="button"
            onClick={onOpenFutureBookings}
            disabled={!isEnabled}
            className="px-4 py-2.5 bg-brand-50 hover:bg-brand-100 disabled:opacity-50 text-brand-700 text-xs font-semibold rounded-xl border border-brand-200 transition flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-brand-600" />
            Pull Future Bookings
          </button>

          <button
            type="button"
            onClick={() => onNavigateToTab('room_mapping')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            Configure Mapping
          </button>

          <button
            type="button"
            onClick={handleToggleActive}
            disabled={toggling}
            className={`px-4 py-2.5 ml-auto text-xs font-semibold rounded-xl border transition flex items-center gap-2 ${
              isEnabled 
                ? 'border-slate-200 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600' 
                : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
            }`}
          >
            {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
            {isEnabled ? 'Disable Channel' : 'Enable Channel'}
          </button>
        </div>
      </div>
    </div>
  );
};
