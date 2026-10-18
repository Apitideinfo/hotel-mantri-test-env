import React from 'react';
import {
  Wifi, CheckCircle2, Clock, AlertTriangle, ShieldCheck,
  Radio, RotateCw, Info, Lock
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping, ChannelSyncLog } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import { getChannelMetadata } from '@/lib/api-channel';

interface OwnerChannelStatusHeaderProps {
  connections: ChannelConnection[];
  mappings: ChannelRateMapping[];
  categories: RoomCategory[];
  syncLogs: ChannelSyncLog[];
  isLiveMode: boolean;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

const timeAgo = (dateStr?: string | null): string => {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const OwnerChannelStatusHeader: React.FC<OwnerChannelStatusHeaderProps> = ({
  connections,
  mappings,
  categories,
  syncLogs,
  isLiveMode,
  onSyncNow,
  isSyncing = false
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = syncLogs.filter((l) => l.created_at?.slice(0, 10) === today);
  const todaySuccess = todayLogs.filter((l) => l.status === 'success').length;
  const todayFailed = todayLogs.filter((l) => l.status === 'failure' || l.status === 'error').length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
      {/* Top Banner with Read-only Admin Managed Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-600" />
              Connected OTA Channels ({connections.length})
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Lock className="w-3 h-3 text-slate-400" /> Managed by Super Admin
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of your hotel's distribution channels. Channel credentials and mappings are configured centrally by Super Admin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs hidden sm:block">
            <span className="text-slate-400 block text-[11px] font-semibold">Today's Syncs</span>
            <span className="font-extrabold text-emerald-700">{todaySuccess} OK</span>
            {todayFailed > 0 && <span className="font-extrabold text-red-600 ml-1.5">/ {todayFailed} Failed</span>}
          </div>

          {onSyncNow && (
            <button
              onClick={onSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              title="Trigger live synchronization with OTA channel manager"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards Grid */}
      {connections.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-slate-700">No OTA Channels Active</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Your hotel does not have active OTA channels. Contact your Super Admin to connect MakeMyTrip, Goibibo, Booking.com, or Agoda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {connections.map((c) => {
            const meta = getChannelMetadata(c.channel_type);
            const isEnabled = c.is_enabled !== false;
            const channelMappings = mappings.filter(
              (m) => m.channel_connection_id === c.id || (!m.channel_connection_id && c.channel_type === 'agoda')
            );
            const mappedCount = new Set(channelMappings.filter((m) => m.room_category_id).map((m) => m.room_category_id)).size;
            const totalCategories = categories.length;

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between space-y-2.5 transition-all ${
                  !isEnabled
                    ? 'bg-slate-50 border-slate-200 text-slate-400'
                    : c.status === 'connected'
                    ? 'bg-emerald-50/20 border-emerald-200/70 hover:border-emerald-300'
                    : c.status === 'error'
                    ? 'bg-red-50/20 border-red-200 hover:border-red-300'
                    : 'bg-amber-50/20 border-amber-200/70 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-xs text-brand-navy-800 shadow-2xs">
                      {(c.channel_name || c.channel_type).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 leading-tight">
                        {c.channel_name || meta.label}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {c.channel_type.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    !isEnabled
                      ? 'bg-slate-100 text-slate-500 border-slate-300'
                      : c.status === 'connected'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : c.status === 'error'
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}>
                    {!isEnabled ? 'Disabled by Admin' : c.status === 'connected' ? 'Connected' : c.status || 'Active'}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] pt-1 border-t border-slate-100">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Last Sync:</span>
                    <span className="font-semibold text-slate-700" title={c.last_sync_at || undefined}>
                      {timeAgo(c.last_sync_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500">
                    <span>Room Mappings:</span>
                    <span className={`font-bold ${mappedCount === totalCategories && totalCategories > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {totalCategories > 0 ? `${mappedCount}/${totalCategories} Mapped` : 'Configured'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
