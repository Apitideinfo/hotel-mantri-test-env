import React, { useState } from 'react';
import { 
  Building2, CheckCircle2, AlertTriangle, XCircle, Clock, 
  RefreshCw, MoreVertical, Settings, Download, Zap, Eye,
  Check, AlertCircle, ArrowUpRight
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping } from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';

interface ChannelCardProps {
  channel: ChannelConnection;
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  onManage: (channel: ChannelConnection) => void;
  onSync: (channel: ChannelConnection) => void;
  onPullBookings: (channel: ChannelConnection) => void;
  onToggleEnabled: (channel: ChannelConnection, enabled: boolean) => void;
  syncing?: boolean;
}

// Brand color and initials mapping for top OTAs
const OTA_METADATA: Record<string, { bg: string; text: string; label: string; initials: string }> = {
  agoda: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Agoda', initials: 'AG' },
  booking_com: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Booking.com', initials: 'BK' },
  mmt: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'MakeMyTrip', initials: 'MMT' },
  goibibo: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', label: 'Goibibo', initials: 'GO' },
  expedia: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Expedia', initials: 'EX' },
  airbnb: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', label: 'Airbnb', initials: 'AB' },
  cleartrip: { bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-700', label: 'Cleartrip', initials: 'CT' },
  easemytrip: { bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', label: 'EaseMyTrip', initials: 'EMT' },
  hotels_com: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700', label: 'Hotels.com', initials: 'H' },
  trip_com: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', label: 'Trip.com', initials: 'TR' },
  yatra: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Yatra / Travelguru', initials: 'YT' },
};

export const ChannelCard: React.FC<ChannelCardProps> = ({
  channel,
  categories,
  ratePlans,
  mappings,
  onManage,
  onSync,
  onPullBookings,
  onToggleEnabled,
  syncing = false
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const meta = OTA_METADATA[channel.channel_type.toLowerCase()] || {
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-700',
    label: channel.channel_name || channel.channel_type,
    initials: (channel.channel_name || 'OT').slice(0, 2).toUpperCase()
  };

  // Calculate real mapping counts
  const channelMappings = mappings.filter(
    m => m.channel_connection_id === channel.id || (!m.channel_connection_id && channel.channel_type === 'agoda')
  );
  
  const mappedRoomIds = new Set(channelMappings.filter(m => m.status === 'mapped' && m.room_category_id).map(m => m.room_category_id));
  const mappedRateIds = new Set(channelMappings.filter(m => m.status === 'mapped' && m.rate_plan_id).map(m => m.rate_plan_id));
  
  const totalRooms = categories.length || 0;
  const mappedRoomsCount = mappedRoomIds.size;
  const totalRates = ratePlans.length || 0;
  const mappedRatesCount = mappedRateIds.size;

  // Determine channel status badge
  const isEnabled = channel.is_enabled !== false;
  let statusBadge = {
    label: 'Connected',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  if (!isEnabled) {
    statusBadge = {
      label: 'Disabled',
      dotClass: 'bg-slate-400',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200'
    };
  } else if (channel.status === 'error' || channel.last_sync_status === 'failure') {
    statusBadge = {
      label: 'Attention Required',
      dotClass: 'bg-red-500',
      badgeClass: 'bg-red-50 text-red-700 border-red-200'
    };
  } else if (mappedRoomsCount === 0 || channel.mapping_status === 'unmapped') {
    statusBadge = {
      label: 'Needs Setup',
      dotClass: 'bg-orange-500',
      badgeClass: 'bg-orange-50 text-orange-700 border-orange-200'
    };
  } else if (channel.status === 'awaiting_activation' || channel.connection_status === 'pending' || channel.status === 'disconnected') {
    statusBadge = {
      label: 'Awaiting Activation',
      dotClass: 'bg-amber-500',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
    };
  }

  // Format last sync time human readable
  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const isInventorySynced = channel.last_sync_status === 'success' || !!channel.last_sync_at;
  const isRatesSynced = channel.last_sync_status === 'success' || !!channel.last_sync_at;

  return (
    <div className={`relative bg-white rounded-2xl border transition-all duration-200 hover:shadow-lg flex flex-col justify-between ${
      isEnabled ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 bg-slate-50/50 opacity-80'
    }`}>
      <div className="p-5">
        {/* Card Header: Icon, Name, Category, Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm border shadow-sm ${meta.bg} ${meta.text}`}>
              {meta.initials}
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 tracking-tight leading-tight">
                {channel.channel_name || meta.label}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">Online distribution</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusBadge.badgeClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dotClass}`} />
              {statusBadge.label}
            </span>

            {/* Quick Action ⋮ dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onSync(channel); }}
                      disabled={syncing}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-brand-600' : ''}`} />
                      Sync Distribution Now
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onPullBookings(channel); }}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      Pull Future Bookings
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); onToggleEnabled(channel, !isEnabled); }}
                      className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      {isEnabled ? 'Disable Connection' : 'Enable Connection'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Real Channel Stats */}
        <div className="space-y-2 py-3 border-y border-slate-100 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Rooms Mapped:</span>
            <span className="font-semibold text-slate-700">
              {mappedRoomsCount} / {totalRooms} mapped
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Rates Mapped:</span>
            <span className="font-semibold text-slate-700">
              {mappedRatesCount} / {totalRates} mapped
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Last Sync:</span>
            <span className="font-medium text-slate-600 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {formatTimeAgo(channel.last_sync_at)}
            </span>
          </div>
        </div>

        {/* Sync Badges */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            isInventorySynced ? 'bg-emerald-50/70 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium truncate">Inventory {isInventorySynced ? 'Synced' : 'Pending'}</span>
          </div>
          <div className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            isRatesSynced ? 'bg-emerald-50/70 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium truncate">Rates {isRatesSynced ? 'Synced' : 'Pending'}</span>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 font-mono truncate">
          ID: {channel.external_channel_id || channel.id.slice(0, 8)}
        </span>
        <button
          type="button"
          onClick={() => onManage(channel)}
          className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-sm hover:shadow transition flex items-center gap-1"
        >
          Manage
          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    </div>
  );
};
