import { useState, useEffect, useCallback } from 'react';
import {
  Radio, Building2, Search, RefreshCw, CheckCircle2, AlertTriangle,
  Clock3, ChevronLeft, ArrowRight
} from 'lucide-react';
import { getEnterpriseHotels, getChannelManagerHotelStatuses } from '../api';
import type { EnterpriseHotel, ChannelManagerHotelStatus } from '../types';
import { ChannelManager } from '@/screens/channel/ChannelManager';
import { setCurrentHotelId } from '@/lib/api';
import { PageHeader, Card, LoadingState, ErrorState } from '../ui';

interface Props {
  initialHotelId?: string | null;
  onBack?: () => void;
}

export const ChannelManagerScreen = ({ initialHotelId, onBack }: Props) => {
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [channelStatuses, setChannelStatuses] = useState<Record<string, ChannelManagerHotelStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(initialHotelId ?? null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [hList, cStatuses] = await Promise.all([
        getEnterpriseHotels(),
        getChannelManagerHotelStatuses(),
      ]);
      const activeHotels = hList.filter((h) => !h.archived_at);
      setHotels(activeHotels);
      setChannelStatuses(Object.fromEntries(cStatuses.map((s) => [s.hotel_id, s])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Channel Manager data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selected hotel changes, sync current hotel context for API calls
  useEffect(() => {
    if (selectedHotelId) {
      setCurrentHotelId(selectedHotelId);
    } else {
      setCurrentHotelId(null);
    }
  }, [selectedHotelId]);

  const selectedHotel = hotels.find((h) => h.id === selectedHotelId);

  const handleSelectHotel = (hotelId: string) => {
    setSelectedHotelId(hotelId);
    setCurrentHotelId(hotelId);
  };

  const handleDeselect = () => {
    setSelectedHotelId(null);
    setCurrentHotelId(null);
  };

  // Filtered hotels
  const filteredHotels = hotels.filter((h) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      h.hotel_name.toLowerCase().includes(q) ||
      h.city.toLowerCase().includes(q) ||
      (h.property_code ?? '').toLowerCase().includes(q) ||
      h.owner_name.toLowerCase().includes(q)
    );
  });

  // Calculate summary metrics
  const totalHotels = hotels.length;
  const liveCount = Object.values(channelStatuses).filter((s) => s.connected).length;
  const configuredCount = Object.values(channelStatuses).filter((s) => s.enabled).length;
  const needsAttentionCount = Object.values(channelStatuses).filter((s) => s.enabled && (!s.mapping_complete || s.sync_error)).length;

  if (loading && hotels.length === 0) {
    return <LoadingState message="Loading Channel Manager status..." />;
  }

  if (error && hotels.length === 0) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  // If a hotel is selected, render Superadmin configuration view for that hotel
  if (selectedHotelId && selectedHotel) {
    return (
      <div className="space-y-4">
        {/* Superadmin Hotel Selector Bar */}
        <div className="bg-gradient-to-r from-amber-100/90 via-amber-50/70 to-white border-2 border-amber-300/80 text-slate-900 rounded-2xl p-4.5 shadow-card flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDeselect}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white hover:from-amber-600 hover:to-amber-800 border border-amber-400/40 rounded-xl transition shadow-gold-glow flex items-center gap-1.5 text-xs font-extrabold"
            >
              <ChevronLeft className="w-4 h-4 text-white" /> All Properties
            </button>

            <div className="h-6 w-px bg-amber-300/70 hidden sm:block" />

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-amber-950">{selectedHotel.hotel_name}</h2>
                {selectedHotel.property_code && (
                  <span className="text-[10px] font-mono bg-gradient-to-r from-amber-500 to-amber-600 text-white px-2.5 py-0.5 rounded-full font-extrabold shadow-xs">
                    {selectedHotel.property_code}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-amber-800/80">
                {selectedHotel.city}, {selectedHotel.state} · Owner: <span className="font-extrabold text-slate-900">{selectedHotel.owner_name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Quick Hotel Switcher Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-900 font-extrabold hidden md:inline">Switch Property:</span>
              <select
                value={selectedHotelId}
                onChange={(e) => handleSelectHotel(e.target.value)}
                className="bg-amber-50/80 text-slate-900 border border-amber-300 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs max-w-[220px]"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hotel_name} ({h.city})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadData}
              className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 rounded-xl transition shadow-xs"
              title="Refresh Properties"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Embedded ChannelManager in Superadmin Mode */}
        <ChannelManager
          mode="super_admin"
          onBack={handleDeselect}
        />
      </div>
    );
  }

  // Otherwise, render Superadmin Channel Manager Property Dashboard
  return (
    <div className="space-y-6">
      <PageHeader
        title="Channel Manager Administration"
        subtitle="Configure, monitor, and manage OTA integrations & Aiosell credentials across enterprise properties."
        icon={<Radio className="w-6 h-6 text-purple-600" />}
        action={
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Statuses
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3 border-t-2 border-t-sky-500 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700 flex items-center justify-center font-bold border border-sky-200/50">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">Total Properties</p>
            <p className="text-xl font-extrabold text-slate-900">{totalHotels}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-t-2 border-t-emerald-500 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200/50">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">Live Sync Active</p>
            <p className="text-xl font-extrabold text-emerald-600">{liveCount}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-t-2 border-t-amber-500 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-700 flex items-center justify-center font-bold border border-amber-200/50">
            <Clock3 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">Configured / Ready</p>
            <p className="text-xl font-extrabold text-amber-600">{configuredCount}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-t-2 border-t-orange-500 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-rose-100 text-orange-700 flex items-center justify-center font-bold border border-orange-200/50">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-extrabold uppercase tracking-wider">Needs Attention</p>
            <p className="text-xl font-extrabold text-orange-600">{needsAttentionCount}</p>
          </div>
        </Card>
      </div>

      {/* Filter and Search */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search properties by name, city, owner, property code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-inner"
            />
          </div>
          <p className="text-xs text-slate-400">
            Showing <span className="font-bold text-slate-800">{filteredHotels.length}</span> of {hotels.length} properties
          </p>
        </div>

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filteredHotels.map((hotel) => {
            const st = channelStatuses[hotel.id];
            const isLive = st?.connected ?? false;
            const isEnabled = st?.enabled ?? false;

            return (
              <div
                key={hotel.id}
                onClick={() => handleSelectHotel(hotel.id)}
                className="bg-gradient-to-br from-white via-amber-50/20 to-amber-50/40 border-2 border-amber-200/70 hover:border-amber-400 hover:shadow-card-hover rounded-2xl p-5 cursor-pointer transition-all space-y-4 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 group-hover:text-amber-700 transition">
                        {hotel.hotel_name}
                      </h3>
                      <p className="text-xs font-medium text-amber-900/60">
                        {hotel.city}, {hotel.state} {st?.aiosell_hotel_code ? `· Code: ${st.aiosell_hotel_code}` : hotel.property_code ? `· Code: ${hotel.property_code}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shadow-xs ${
                        isLive
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isEnabled
                          ? 'bg-gradient-to-r from-amber-100 via-amber-200 to-yellow-100 text-amber-900 border-amber-300'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {isLive ? 'Live Sync' : isEnabled ? 'Configured' : 'Not Setup'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-amber-200/50">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-900/60 font-medium">Owner:</span>
                      <span className="font-bold text-slate-900">{hotel.owner_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-900/60 font-medium">Total Rooms:</span>
                      <span className="font-bold text-slate-900">{hotel.total_rooms}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-900/60 font-medium">Room/Rate Mapping:</span>
                      <span className={`font-bold ${st?.mapping_complete ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {st?.mapping_complete ? 'Complete' : 'Incomplete'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-900/60 font-medium">Last Sync:</span>
                      <span className="text-slate-700 tabular-nums font-semibold">
                        {st?.last_sync ? new Date(st.last_sync).toLocaleString('en-IN') : 'No sync yet'}
                      </span>
                    </div>
                    {st?.sync_error && (
                      <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 truncate mt-2" title={st.sync_error}>
                        Error: {st.sync_error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs font-extrabold text-amber-700 group-hover:text-amber-900 transition-colors">
                  <span>Configure Channel Manager</span>
                  <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>

        {filteredHotels.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Radio className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold">No matching properties found.</p>
          </div>
        )}
      </Card>
    </div>
  );
};
