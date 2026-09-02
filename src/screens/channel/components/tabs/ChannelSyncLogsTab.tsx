import React, { useState } from 'react';
import { 
  FileText, CheckCircle2, XCircle, Clock, 
  RotateCw, RefreshCw, AlertCircle, ChevronDown, ChevronRight 
} from 'lucide-react';
import type { ChannelConnection, ChannelSyncLog } from '@/lib/api-channel';
import { retrySyncLog } from '@/lib/api-channel';

interface ChannelSyncLogsTabProps {
  channel: ChannelConnection;
  logs: ChannelSyncLog[];
  onRefresh: () => void;
}

export const ChannelSyncLogsTab: React.FC<ChannelSyncLogsTabProps> = ({
  channel,
  logs,
  onRefresh
}) => {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Filter logs for this channel connection
  const channelLogs = logs.filter(l => 
    l.channel_connection_id === channel.id || 
    (channel.channel_type === 'agoda' && (!l.channel_connection_id || l.message?.toLowerCase().includes('agoda') || l.log_type?.includes('INVENTORY') || l.log_type?.includes('RATE')))
  );

  const handleRetry = async (log: ChannelSyncLog) => {
    setRetryingId(log.id);
    try {
      await retrySyncLog(log);
      onRefresh();
    } catch (err) {
      console.error('Failed to retry sync:', err);
    } finally {
      setRetryingId(null);
    }
  };

  const fmtTime = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between bg-slate-50 p-4 border border-slate-200 rounded-2xl">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Synchronization History</h4>
          <p className="text-xs text-slate-500">
            Real-time audit log of outbound distribution and inbound reservations for {channel.channel_name || channel.channel_type}.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
          Refresh Logs
        </button>
      </div>

      {channelLogs.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No Sync Logs Recorded</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Sync operations will automatically be logged here with status, duration, and error diagnostics.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Direction</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Details</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {channelLogs.map((log) => {
                const isSuccess = log.status === 'success';
                const isExpanded = expandedLogId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/60 transition cursor-pointer" onClick={() => setExpandedLogId(isExpanded ? null : log.id)}>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {fmtTime(log.created_at)}
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {log.log_type.replace(/_/g, ' ')}
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                          {log.direction || 'outbound'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isSuccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {isSuccess ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                          {log.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {log.message || log.error_detail || '—'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isSuccess && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleRetry(log); }}
                              disabled={retryingId === log.id}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-semibold rounded-lg transition flex items-center gap-1"
                            >
                              <RotateCw className={`w-3 h-3 ${retryingId === log.id ? 'animate-spin' : ''}`} />
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setExpandedLogId(isExpanded ? null : log.id); }}
                            className="p-1 text-slate-400 hover:text-slate-600"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={6} className="px-4 py-3 text-xs border-t border-slate-100">
                          <div className="space-y-1.5 font-mono text-[11px]">
                            <p><strong className="text-slate-700">Message:</strong> {log.message || 'No additional message'}</p>
                            {log.date_range && <p><strong className="text-slate-700">Date Range:</strong> {log.date_range}</p>}
                            {log.error_detail && (
                              <p className="text-red-700 bg-red-50 p-2 rounded-lg border border-red-100">
                                <strong>Error Detail:</strong> {log.error_detail}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
