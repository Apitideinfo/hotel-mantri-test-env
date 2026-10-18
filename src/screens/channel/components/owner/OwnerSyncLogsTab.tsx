import React, { useState, useMemo } from 'react';
import {
  Zap, Search, Filter, RefreshCw, CheckCircle2,
  AlertTriangle, XCircle, Clock, ChevronDown, ChevronRight,
  Download, RotateCw, Loader2, Info
} from 'lucide-react';
import type { ChannelSyncLog, ChannelConnection } from '@/lib/api-channel';
import { retrySyncLog } from '@/lib/api-channel';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface OwnerSyncLogsTabProps {
  logs: ChannelSyncLog[];
  connections: ChannelConnection[];
  onRefresh: () => void;
}

export const OwnerSyncLogsTab: React.FC<OwnerSyncLogsTabProps> = ({
  logs,
  connections,
  onRefresh
}) => {
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  // Retry state
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [confirmRetryLog, setConfirmRetryLog] = useState<ChannelSyncLog | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Toggle expanded payload
  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Channel filter
      if (filterChannel !== 'all') {
        const logChannel = (log.channel_name || (log as any).channel_type || '').toLowerCase();
        if (logChannel !== filterChannel.toLowerCase()) return false;
      }

      // 2. Type filter
      if (filterType !== 'all') {
        const logType = (log.log_type || '').toLowerCase();
        if (logType !== filterType.toLowerCase()) return false;
      }

      // 3. Status filter
      if (filterStatus !== 'all') {
        const logStatus = (log.status || '').toLowerCase();
        if (filterStatus === 'failed') {
          if (logStatus !== 'failure' && logStatus !== 'error' && logStatus !== 'failed') return false;
        } else if (logStatus !== filterStatus) {
          return false;
        }
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const payloadStr = typeof log.payload === 'object' ? JSON.stringify(log.payload) : String(log.payload || '');
        const errorStr = log.error_details || '';
        const match =
          (log.channel_name || '').toLowerCase().includes(q) ||
          (log.log_type || '').toLowerCase().includes(q) ||
          payloadStr.toLowerCase().includes(q) ||
          errorStr.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [logs, filterChannel, filterType, filterStatus, searchQuery]);

  // Execute Idempotent Retry
  const handleExecuteRetry = async () => {
    if (!confirmRetryLog) return;
    const logId = confirmRetryLog.id;
    setConfirmRetryLog(null);
    setRetryingLogId(logId);
    setRetryFeedback(null);

    try {
      const res: any = await retrySyncLog(logId);
      setRetryFeedback({
        type: res?.success ? 'success' : 'error',
        message: res?.message || (res?.success ? 'Sync operation retried successfully.' : 'Retry failed.')
      });
      onRefresh();
    } catch (err: any) {
      setRetryFeedback({
        type: 'error',
        message: err?.message || 'Failed to retry sync operation.'
      });
    } finally {
      setRetryingLogId(null);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Timestamp', 'Channel', 'Operation', 'Status', 'Duration (ms)', 'Attempts', 'Error'];
    const rows = filteredLogs.map((l) => [
      l.created_at || '',
      `"${l.channel_name || 'All'}"`,
      `"${l.log_type || 'Sync'}"`,
      l.status || '',
      l.duration_ms || 0,
      l.attempt_count || 1,
      `"${(l.error_details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ota_sync_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for human-readable payload summary
  const getPayloadSummary = (log: ChannelSyncLog) => {
    if (!log.payload) return log.error_details ? 'Failed during request initiation' : 'Standard sync batch';
    const p = log.payload;
    if (p.startDate && p.endDate) {
      return `${p.roomCategoryName || 'All Categories'}: ${p.startDate} to ${p.endDate}`;
    }
    if (p.summary) return p.summary;
    if (typeof p === 'string') return p.slice(0, 80);
    return 'Parameters submitted';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            OTA Synchronization Logs
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit history of rate pushes, inventory updates, and reservation syncs with external OTAs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Export to CSV
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Retry Feedback Banner */}
      {retryFeedback && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border ${
          retryFeedback.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {retryFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <span>{retryFeedback.message}</span>
          </div>
          <button onClick={() => setRetryFeedback(null)} className="text-slate-400 hover:text-slate-600 text-sm font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
        <div>
          <label className="block text-slate-500 font-bold mb-1">Filter Channel</label>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            <option value="all">All Channels</option>
            {connections.map((c) => (
              <option key={c.id} value={c.channel_name || c.channel_type}>
                {c.channel_name || c.channel_type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-500 font-bold mb-1">Operation Type</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            <option value="all">All Operations</option>
            <option value="rate_push">Rate Push</option>
            <option value="inventory_push">Inventory Push</option>
            <option value="reservation_pull">Reservation Pull</option>
            <option value="live_sync">Full Live Sync</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-500 font-bold mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed / Error</option>
            <option value="partial">Partial</option>
            <option value="pending">In Progress</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-500 font-bold mb-1">Search Logs</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
          <p className="text-xs font-bold text-slate-700">No Sync Logs Found</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Logs will appear here when rate pushes or inventory updates are performed.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold">
                <th className="p-3 w-8"></th>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Operation</th>
                <th className="p-3">Payload Summary</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Duration</th>
                <th className="p-3 text-center">Attempts</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogIds.has(log.id);
                const isFailed = log.status === 'failure' || log.status === 'error' || log.status === 'failed';
                const isRetrying = retryingLogId === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => toggleExpand(log.id)}
                      className={`hover:bg-slate-50/60 cursor-pointer transition ${
                        isExpanded ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="p-3 text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="p-3 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                        {log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="p-3 font-extrabold text-slate-900">
                        {log.channel_name || 'All Channels'}
                      </td>
                      <td className="p-3">
                        <span className="font-bold uppercase tracking-wider text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {log.log_type || 'Sync'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={getPayloadSummary(log)}>
                        {getPayloadSummary(log)}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                          log.status === 'success'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isFailed
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          {log.status === 'success' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : isFailed ? (
                            <XCircle className="w-3 h-3 text-red-600" />
                          ) : (
                            <Clock className="w-3 h-3 text-amber-600" />
                          )}
                          <span className="capitalize">{log.status}</span>
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-[11px] text-slate-500">
                        {log.duration_ms ? `${log.duration_ms}ms` : '—'}
                      </td>
                      <td className="p-3 text-center font-bold text-slate-700 text-xs">
                        {log.attempt_count || 1}
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {isFailed ? (
                          <button
                            type="button"
                            onClick={() => setConfirmRetryLog(log)}
                            disabled={isRetrying}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            <RotateCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                            <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable row: Sanitized request & response */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={9} className="p-4 border-t border-slate-100 space-y-3">
                          <div className="text-xs space-y-2">
                            {log.error_details && (
                              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800">
                                <span className="font-extrabold block mb-0.5">Error Detail:</span>
                                <p className="font-mono text-[11px]">{log.error_details}</p>
                              </div>
                            )}

                            <div>
                              <span className="font-bold text-slate-700 block mb-1">
                                Sanitized Operation Payload:
                              </span>
                              <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48">
                                {typeof log.payload === 'object'
                                  ? JSON.stringify(log.payload, null, 2)
                                  : String(log.payload || 'No payload recorded')}
                              </pre>
                            </div>
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

      {/* Confirmation Modal for Retry */}
      {confirmRetryLog && (
        <ConfirmModal
          open={!!confirmRetryLog}
          title="Retry Failed Sync Operation"
          message={`Are you sure you want to retry the ${confirmRetryLog.log_type || 'Sync'} operation for ${confirmRetryLog.channel_name || 'All Channels'}? This will resubmit the original payload idempotently.`}
          confirmText="Retry Operation"
          cancelText="Cancel"
          variant="primary"
          onConfirm={handleExecuteRetry}
          onClose={() => setConfirmRetryLog(null)}
        />
      )}
    </div>
  );
};
