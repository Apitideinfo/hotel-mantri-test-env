import { CheckCircle2, CircleOff, Clock3, AlertTriangle } from 'lucide-react';
import type { ChannelManagerHotelStatus } from '../types';

export const ChannelStatusCell = ({ status }: { status?: ChannelManagerHotelStatus }) => {
  if (!status) return <span className="text-[10px] text-slate-400">Not configured</span>;
  return (
    <div className="space-y-1 min-w-[150px]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold">
        {status.enabled ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <CircleOff className="w-3 h-3 text-slate-400" />}
        <span className={status.enabled ? 'text-emerald-700' : 'text-slate-500'}>{status.enabled ? 'Enabled' : 'Disabled'}</span>
        <span className="text-slate-300">·</span>
        <span className={status.connected ? 'text-emerald-700' : 'text-slate-500'}>{status.connected ? 'Connected' : 'Not connected'}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
        {status.mapping_complete ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-500" />}
        {status.mapping_complete ? 'Mapping complete' : 'Mapping incomplete'}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
        <Clock3 className="w-3 h-3" />
        {status.last_sync ? new Date(status.last_sync).toLocaleString('en-IN') : 'No sync yet'}
      </div>
      {status.sync_error && <p className="text-[10px] text-red-600 truncate max-w-[180px]" title={status.sync_error}>{status.sync_error}</p>}
    </div>
  );
};
