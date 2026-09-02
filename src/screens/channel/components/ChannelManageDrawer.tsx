import React, { useState, useEffect } from 'react';
import { 
  X, LayoutDashboard, BedDouble, Tag, Calendar, 
  FileText, Settings, Building2, CheckCircle2, 
  AlertTriangle, Clock, Download 
} from 'lucide-react';
import type { 
  ChannelConnection, ChannelRateMapping, 
  ChannelOtaReservation, ChannelSyncLog 
} from '@/lib/api-channel';
import type { RoomCategory } from '@/lib/types';
import type { RatePlan } from '@/lib/types-reservations';
import { ChannelOverviewTab } from './tabs/ChannelOverviewTab';
import { ChannelRoomMappingTab } from './tabs/ChannelRoomMappingTab';
import { ChannelRateMappingTab } from './tabs/ChannelRateMappingTab';
import { ChannelReservationsTab } from './tabs/ChannelReservationsTab';
import { ChannelSyncLogsTab } from './tabs/ChannelSyncLogsTab';
import { ChannelSettingsTab } from './tabs/ChannelSettingsTab';
import { FutureBookingsModal } from './FutureBookingsModal';

interface ChannelManageDrawerProps {
  channel: ChannelConnection;
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  reservations: ChannelOtaReservation[];
  syncLogs: ChannelSyncLog[];
  onClose: () => void;
  onRefresh: () => void;
}

type ManageTab = 'overview' | 'room_mapping' | 'rate_mapping' | 'reservations' | 'logs' | 'settings';

export const ChannelManageDrawer: React.FC<ChannelManageDrawerProps> = ({
  channel,
  categories,
  ratePlans,
  mappings,
  reservations,
  syncLogs,
  onClose,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<ManageTab>('overview');
  const [showFutureBookings, setShowFutureBookings] = useState(false);

  // Keyboard escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isEnabled = channel.is_enabled !== false;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-end animate-fade-in">
      <div 
        className="bg-white w-full max-w-4xl h-full flex flex-col shadow-2xl overflow-hidden border-l border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 font-bold text-base shadow-sm">
              {(channel.channel_name || channel.channel_type).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900">
                  {channel.channel_name || channel.channel_type}
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  !isEnabled
                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                    : channel.status === 'error'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : channel.status === 'awaiting_activation'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    !isEnabled ? 'bg-slate-400' : channel.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'
                  }`} />
                  {!isEnabled ? 'Disabled' : channel.status === 'error' ? 'Attention' : 'Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Property ID: {channel.external_channel_id || 'Not configured'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFutureBookings(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold rounded-xl border border-brand-200 transition"
            >
              <Download className="w-3.5 h-3.5 text-brand-600" />
              Pull Bookings
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 gap-1 flex-shrink-0 overflow-x-auto text-xs font-semibold">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'room_mapping', label: 'Room Mapping', icon: BedDouble },
            { id: 'rate_mapping', label: 'Rate Mapping', icon: Tag },
            { id: 'reservations', label: 'Reservations', icon: Calendar },
            { id: 'logs', label: 'Sync History', icon: FileText },
            { id: 'settings', label: 'Settings', icon: Settings },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as ManageTab)}
                className={`py-3.5 px-4 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                  active 
                    ? 'border-brand-600 text-brand-600 bg-white font-bold rounded-t-lg' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {activeTab === 'overview' && (
            <ChannelOverviewTab
              channel={channel}
              categories={categories}
              ratePlans={ratePlans}
              mappings={mappings}
              logs={syncLogs}
              onOpenFutureBookings={() => setShowFutureBookings(true)}
              onNavigateToTab={(tab) => setActiveTab(tab as ManageTab)}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'room_mapping' && (
            <ChannelRoomMappingTab
              channel={channel}
              categories={categories}
              mappings={mappings}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'rate_mapping' && (
            <ChannelRateMappingTab
              channel={channel}
              ratePlans={ratePlans}
              mappings={mappings}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'reservations' && (
            <ChannelReservationsTab
              channel={channel}
              reservations={reservations}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'logs' && (
            <ChannelSyncLogsTab
              channel={channel}
              logs={syncLogs}
              onRefresh={onRefresh}
            />
          )}

          {activeTab === 'settings' && (
            <ChannelSettingsTab
              channel={channel}
              onRefresh={onRefresh}
              onClose={onClose}
            />
          )}
        </div>

        {/* Future Bookings Modal Overlay if triggered */}
        {showFutureBookings && (
          <FutureBookingsModal
            channel={channel}
            onClose={() => setShowFutureBookings(false)}
            onComplete={onRefresh}
          />
        )}
      </div>
    </div>
  );
};
