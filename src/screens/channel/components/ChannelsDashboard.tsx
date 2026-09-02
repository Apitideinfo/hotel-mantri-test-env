import React, { useState, useMemo } from 'react';
import { 
  Plus, Search, Filter, RefreshCw, Radio, 
  CheckCircle2, AlertTriangle, AlertCircle, ArrowUpRight 
} from 'lucide-react';
import type { 
  ChannelConnection, ChannelRateMapping, 
  ChannelOtaReservation, ChannelSyncLog 
} from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { ChannelCard } from './ChannelCard';
import { AddChannelModal } from './AddChannelModal';
import { ChannelManageDrawer } from './ChannelManageDrawer';
import { FutureBookingsModal } from './FutureBookingsModal';
import { syncChannelInventory, syncChannelRates, updateChannel } from '@/lib/api-channel';

interface ChannelsDashboardProps {
  connections: ChannelConnection[];
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  reservations: ChannelOtaReservation[];
  syncLogs: ChannelSyncLog[];
  onRefresh: () => void;
  loading?: boolean;
}

type FilterStatus = 'all' | 'connected' | 'needs_setup' | 'attention';

export const ChannelsDashboard: React.FC<ChannelsDashboardProps> = ({
  connections,
  categories,
  ratePlans,
  mappings,
  reservations,
  syncLogs,
  onRefresh,
  loading = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedChannel, setSelectedChannel] = useState<ChannelConnection | null>(null);
  const [futureBookingsChannel, setFutureBookingsChannel] = useState<ChannelConnection | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [syncingMap, setSyncingMap] = useState<Record<string, boolean>>({});

  // Filter & Search logic
  const filteredChannels = useMemo(() => {
    return connections.filter(channel => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const nameMatch = (channel.channel_name || '').toLowerCase().includes(q);
        const typeMatch = channel.channel_type.toLowerCase().includes(q);
        const idMatch = (channel.external_channel_id || '').toLowerCase().includes(q);
        if (!nameMatch && !typeMatch && !idMatch) return false;
      }

      // 2. Filter Status
      if (filterStatus === 'all') return true;

      const channelMappings = mappings.filter(
        m => m.channel_connection_id === channel.id || (!m.channel_connection_id && channel.channel_type === 'agoda')
      );
      const mappedRoomsCount = new Set(channelMappings.filter(m => m.status === 'mapped' && m.room_category_id).map(m => m.room_category_id)).size;

      if (filterStatus === 'connected') {
        return channel.is_enabled !== false && channel.status !== 'error' && mappedRoomsCount > 0;
      }
      if (filterStatus === 'needs_setup') {
        return mappedRoomsCount === 0 || channel.status === 'awaiting_activation';
      }
      if (filterStatus === 'attention') {
        return channel.status === 'error' || channel.last_sync_status === 'failure';
      }

      return true;
    });
  }, [connections, searchQuery, filterStatus, mappings]);

  // Quick sync action
  const handleQuickSync = async (channel: ChannelConnection) => {
    setSyncingMap(prev => ({ ...prev, [channel.id]: true }));
    try {
      const today = new Date().toISOString().split('T')[0];
      const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      await Promise.all([
        syncChannelInventory(channel.id, today, future),
        syncChannelRates(channel.id, today, future)
      ]);
      onRefresh();
    } catch (err) {
      console.error('Quick sync failed:', err);
    } finally {
      setSyncingMap(prev => ({ ...prev, [channel.id]: false }));
    }
  };

  const handleToggleEnabled = async (channel: ChannelConnection, enabled: boolean) => {
    try {
      await updateChannel(channel.id, { isEnabled: enabled });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle channel status:', err);
    }
  };

  // Open existing channel from AddChannelModal duplicate prompt
  const handleOpenExisting = (channelId: string) => {
    const existing = connections.find(c => c.id === channelId);
    setShowAddModal(false);
    if (existing) {
      setSelectedChannel(existing);
    }
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Channels</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your OTA connections, room mappings, and distribution across online channels.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue hover:shadow-md transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-2xl shadow-sm">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Channels', count: connections.length },
            { 
              id: 'connected', 
              label: 'Connected', 
              count: connections.filter(c => c.is_enabled !== false && c.status !== 'error').length 
            },
            { 
              id: 'needs_setup', 
              label: 'Needs Setup', 
              count: connections.filter(c => c.status === 'awaiting_activation' || c.mapping_status === 'unmapped').length 
            },
            { 
              id: 'attention', 
              label: 'Attention', 
              count: connections.filter(c => c.status === 'error' || c.last_sync_status === 'failure').length 
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id as FilterStatus)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filterStatus === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200/70 text-slate-600'
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                filterStatus === tab.id ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channel or ID..."
            className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-slate-800"
          />
        </div>
      </div>

      {/* Channels Grid / Empty State */}
      {filteredChannels.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center mx-auto shadow-sm">
            <Radio className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery ? 'No Channels Matching Your Search' : 'Connect Your First Channel'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              {searchQuery 
                ? 'Try refining your search keyword or clearing the filter.' 
                : 'Distribute your room availability and rate plans seamlessly across Agoda, Booking.com, MakeMyTrip, and other top OTAs.'}
            </p>
          </div>
          {!searchQuery && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Channel
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              categories={categories}
              ratePlans={ratePlans}
              mappings={mappings}
              onManage={(ch) => setSelectedChannel(ch)}
              onSync={handleQuickSync}
              onPullBookings={(ch) => setFutureBookingsChannel(ch)}
              onToggleEnabled={handleToggleEnabled}
              syncing={Boolean(syncingMap[channel.id])}
            />
          ))}
        </div>
      )}

      {/* Add Channel Modal */}
      {showAddModal && (
        <AddChannelModal
          existingConnections={connections}
          onClose={() => setShowAddModal(false)}
          onSuccess={(newCh) => {
            setShowAddModal(false);
            onRefresh();
            if (newCh) setSelectedChannel(newCh);
          }}
          onOpenExisting={handleOpenExisting}
        />
      )}

      {/* Manage Channel Drawer */}
      {selectedChannel && (
        <ChannelManageDrawer
          channel={selectedChannel}
          categories={categories}
          ratePlans={ratePlans}
          mappings={mappings}
          reservations={reservations}
          syncLogs={syncLogs}
          onClose={() => setSelectedChannel(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* Future Bookings Modal */}
      {futureBookingsChannel && (
        <FutureBookingsModal
          channel={futureBookingsChannel}
          onClose={() => setFutureBookingsChannel(null)}
          onComplete={onRefresh}
        />
      )}
    </div>
  );
};
