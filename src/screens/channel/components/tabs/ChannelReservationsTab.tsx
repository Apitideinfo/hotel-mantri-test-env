import React, { useState } from 'react';
import { 
  Calendar, CheckCircle2, Clock, AlertTriangle, 
  LogIn, User, Tag, ExternalLink, RefreshCw 
} from 'lucide-react';
import type { ChannelConnection, ChannelOtaReservation } from '@/lib/api-channel';
import { fmtMoney } from '@/lib/calc';
import { updateOtaReservationStatus } from '@/lib/api-channel';

interface ChannelReservationsTabProps {
  channel: ChannelConnection;
  reservations: ChannelOtaReservation[];
  onRefresh: () => void;
}

export const ChannelReservationsTab: React.FC<ChannelReservationsTabProps> = ({
  channel,
  reservations,
  onRefresh
}) => {
  const [importingId, setImportingId] = useState<string | null>(null);

  // Filter reservations for this channel
  const channelReservations = reservations.filter(r => 
    r.channel_connection_id === channel.id || 
    r.channel_name?.toLowerCase().includes(channel.channel_type.toLowerCase()) ||
    (channel.channel_type === 'agoda' && (!r.channel_connection_id || r.channel_name?.toLowerCase().includes('agoda')))
  );

  const handleImport = async (resId: string) => {
    setImportingId(resId);
    try {
      await updateOtaReservationStatus(resId, 'imported');
      onRefresh();
    } catch (err) {
      console.error('Failed to import reservation:', err);
    } finally {
      setImportingId(null);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between bg-slate-50 p-4 border border-slate-200 rounded-2xl">
        <div>
          <h4 className="text-sm font-bold text-slate-900">OTA Reservations</h4>
          <p className="text-xs text-slate-500">
            Bookings imported from {channel.channel_name || channel.channel_type} via webhook or future pull.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh
        </button>
      </div>

      {channelReservations.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No Reservations Found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            No incoming bookings recorded for this channel yet. Use "Pull Future Bookings" in the Overview tab to fetch recent bookings.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Booking ID & Guest</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4">Room Category</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelReservations.map((r) => {
                const isImported = r.import_status === 'imported';

                return (
                  <tr key={r.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="font-semibold text-slate-800">{r.guest_name || 'Guest'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {r.ota_booking_id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600">
                      <span>{fmtDate(r.check_in_date)} &rarr; {fmtDate(r.check_out_date)}</span>
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {r.room_category || '—'}
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-800">
                      ₹{fmtMoney(Number(r.amount) || 0)}
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isImported ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {isImported ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-amber-600" />}
                        {r.import_status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {!isImported && (
                        <button
                          type="button"
                          onClick={() => handleImport(r.id)}
                          disabled={importingId === r.id}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-sm transition"
                        >
                          {importingId === r.id ? 'Importing...' : 'Import to PMS'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
