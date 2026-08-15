import { useEffect, useState, useCallback } from 'react';
import { ScrollText, Search, Filter } from 'lucide-react';
import { getAuditLogs } from '../api';
import type { AuditLog } from '../types';
import { PageHeader, Card, Badge, LoadingState, ErrorState, EmptyState, fmtDateTime } from '../ui';

export const AuditLogsScreen = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const l = await getAuditLogs({ limit: 200 });
      setLogs(l);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l) => {
    if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
    if (severityFilter !== 'all' && l.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.action.toLowerCase().includes(q) || l.user_email.toLowerCase().includes(q) || l.hotel_name.toLowerCase().includes(q);
    }
    return true;
  });

  const modules = Array.from(new Set(logs.map((l) => l.module))).filter(Boolean);
  const severities = ['info', 'warning', 'error', 'critical'];

  if (loading) return <LoadingState label="Loading audit logs…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Logs" subtitle={`${filtered.length} entries · Read-only`} />

      {error && <ErrorState message={error} />}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by action, user, hotel…"
            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="all">All Modules</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="all">All Severities</option>
          {severities.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No audit logs found" />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {filtered.map((l) => (
              <div key={l.id} className="px-4 py-3 hover:bg-slate-50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      l.severity === 'critical' ? 'bg-red-50' : l.severity === 'error' ? 'bg-orange-50' : l.severity === 'warning' ? 'bg-amber-50' : 'bg-slate-100'
                    }`}>
                      <ScrollText className={`w-4 h-4 ${l.severity === 'critical' ? 'text-red-600' : l.severity === 'error' ? 'text-orange-600' : l.severity === 'warning' ? 'text-amber-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{l.action}</p>
                      <p className="text-xs text-slate-500 truncate">{l.user_email} · {l.module} {l.hotel_name ? `· ${l.hotel_name}` : ''}</p>
                      {l.reason && <p className="text-xs text-amber-600 mt-0.5">Reason: {l.reason}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={l.severity === 'critical' ? 'red' : l.severity === 'error' ? 'orange' : l.severity === 'warning' ? 'amber' : 'slate'}>{l.severity}</Badge>
                    <span className="text-xs text-slate-400">{fmtDateTime(l.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
