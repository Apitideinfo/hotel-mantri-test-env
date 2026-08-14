import { useEffect, useState, useCallback } from 'react';
import {
  Building2, CheckCircle2, AlertTriangle, Ban, Users, BedDouble,
  IndianRupee, Ticket, Zap, CalendarClock, TrendingUp, Activity,
} from 'lucide-react';
import { getEnterpriseHotels, getPayments, getLeads, getTickets, getCompanyUsers } from '../api';
import type { EnterpriseHotel, SubscriptionPayment, CrmLead, SupportTicket, CompanyUser } from '../types';
import { KpiCard, Card, LoadingState, ErrorState, Badge, fmtMoney, fmtDate } from '../ui';

interface Props {
  onNavigateHotels: () => void;
  onNavigateLeads: () => void;
  onNavigateTickets: () => void;
}

export const DashboardScreen = ({ onNavigateHotels, onNavigateLeads, onNavigateTickets }: Props) => {
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [h, p, l, t, u] = await Promise.all([
        getEnterpriseHotels(), getPayments(), getLeads(), getTickets(), getCompanyUsers(),
      ]);
      setHotels(h.filter((x) => !x.archived_at));
      setPayments(p);
      setLeads(l);
      setTickets(t);
      setCompanyUsers(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState label="Loading enterprise dashboard…" />;
  if (error) return <ErrorState message={error} />;

  const active = hotels.filter((h) => h.subscription_status === 'Active');
  const trial = hotels.filter((h) => h.subscription_status === 'Trial');
  const expired = hotels.filter((h) => h.subscription_status === 'Expired');
  const suspended = hotels.filter((h) => h.subscription_status === 'Suspended');
  const openTickets = tickets.filter((t) => t.status === 'Open' || t.status === 'In Progress');
  const newLeads = leads.filter((l) => l.status === 'New Lead');
  const today = new Date().toISOString().slice(0, 10);
  const demosToday = leads.filter((l) => l.status === 'Demo Scheduled' && l.next_follow_up === today);
  const mrr = active.reduce((s, h) => {
    const planPayments = payments.filter((p) => p.hotel_id === h.id && p.billing_cycle === 'monthly');
    return s + planPayments.reduce((ps, p) => ps + (p.amount - p.discount), 0);
  }, 0);
  const outstanding = payments.filter((p) => !p.payment_date).reduce((s, p) => s + p.amount, 0);

  // Monthly revenue (last 6 months)
  const months: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    const rev = payments
      .filter((p) => p.created_at.slice(0, 7) === ym && p.payment_date)
      .reduce((s, p) => s + (p.amount - p.discount), 0);
    months.push({ label: d.toLocaleString('en-IN', { month: 'short' }), value: rev });
  }
  const maxRev = Math.max(...months.map((m) => m.value), 1);

  // Hotel growth (cumulative by month)
  const growth: { label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const ym = d.toISOString().slice(0, 7);
    const count = hotels.filter((h) => h.created_at.slice(0, 7) <= ym).length;
    growth.push({ label: d.toLocaleString('en-IN', { month: 'short' }), value: count });
  }
  const maxGrowth = Math.max(...growth.map((g) => g.value), 1);

  // Upcoming renewals (next 30 days)
  const renewals = hotels
    .filter((h) => h.subscription_expiry && new Date(h.subscription_expiry) > new Date() && new Date(h.subscription_expiry) < new Date(Date.now() + 30 * 86400000))
    .sort((a, b) => (a.subscription_expiry ?? '').localeCompare(b.subscription_expiry ?? ''))
    .slice(0, 5);

  // City distribution
  const cityMap = new Map<string, number>();
  for (const h of hotels) {
    const c = h.city || 'Unknown';
    cityMap.set(c, (cityMap.get(c) ?? 0) + 1);
  }
  const cities = Array.from(cityMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCity = Math.max(...cities.map((c) => c[1]), 1);

  // Top sales execs
  const execPerf = new Map<string, number>();
  for (const l of leads.filter((l) => l.status === 'Converted' && l.assigned_exec)) {
    execPerf.set(l.assigned_exec!, (execPerf.get(l.assigned_exec!) ?? 0) + 1);
  }
  const topExecs = Array.from(execPerf.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ name: companyUsers.find((u) => u.id === id)?.name ?? 'Unknown', count }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Enterprise Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time overview of Hotel Mantri SaaS</p>
      </div>

      {/* KPI Cards — Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Hotels" value={hotels.length} icon={<Building2 className="w-4 h-4" />} color="sky" />
        <KpiCard label="Active" value={active.length} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
        <KpiCard label="Trial" value={trial.length} icon={<CalendarClock className="w-4 h-4" />} color="teal" />
        <KpiCard label="Expired" value={expired.length} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <KpiCard label="Suspended" value={suspended.length} icon={<Ban className="w-4 h-4" />} color="red" />
        <KpiCard label="Company Users" value={companyUsers.length} icon={<Users className="w-4 h-4" />} color="violet" />
      </div>

      {/* KPI Cards — Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="MRR" value={fmtMoney(mrr)} icon={<IndianRupee className="w-4 h-4" />} color="emerald" />
        <KpiCard label="Outstanding" value={fmtMoney(outstanding)} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <KpiCard label="Open Tickets" value={openTickets.length} icon={<Ticket className="w-4 h-4" />} color="orange" />
        <KpiCard label="New Leads" value={newLeads.length} icon={<Zap className="w-4 h-4" />} color="sky" />
        <KpiCard label="Demos Today" value={demosToday.length} icon={<CalendarClock className="w-4 h-4" />} color="violet" />
        <KpiCard label="Hotel Users" value="—" icon={<BedDouble className="w-4 h-4" />} color="slate" sub="per hotel" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Revenue */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Monthly Subscription Revenue</h3>
          </div>
          <div className="flex items-end justify-between gap-3 h-40">
            {months.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-sky-100 rounded-t-lg relative group" style={{ height: `${(m.value / maxRev) * 100}%`, minHeight: '4px' }}>
                  <div className="absolute inset-0 bg-sky-500 rounded-t-lg opacity-0 group-hover:opacity-100 transition" />
                </div>
                <span className="text-[10px] text-slate-500 font-medium">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Hotel Growth */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Hotel Growth Trend</h3>
          </div>
          <div className="flex items-end justify-between gap-3 h-40">
            {growth.map((g, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-emerald-100 rounded-t-lg" style={{ height: `${(g.value / maxGrowth) * 100}%`, minHeight: '4px' }} />
                <span className="text-[10px] text-slate-500 font-medium">{g.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active vs Trial vs Expired */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Hotel Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Active', count: active.length, color: 'bg-emerald-500' },
              { label: 'Trial', count: trial.length, color: 'bg-sky-500' },
              { label: 'Expired', count: expired.length, color: 'bg-amber-500' },
              { label: 'Suspended', count: suspended.length, color: 'bg-red-500' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <span className="text-sm text-slate-600 flex-1">{s.label}</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Upcoming Renewals */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Upcoming Renewals</h3>
          </div>
          {renewals.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No renewals in 30 days</p>
          ) : (
            <div className="space-y-2">
              {renewals.map((h) => (
                <button key={h.id} onClick={onNavigateHotels} className="w-full flex items-center justify-between text-left hover:bg-slate-50 rounded-lg p-2 transition">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{h.hotel_name}</p>
                    <p className="text-xs text-slate-400">{h.city || '—'}</p>
                  </div>
                  <Badge color="amber">{fmtDate(h.subscription_expiry)}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* City Distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">City-wise Distribution</h3>
          {cities.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No data</p>
          ) : (
            <div className="space-y-2">
              {cities.map(([city, count]) => (
                <div key={city} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-20 truncate">{city}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${(count / maxCity) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Third row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Sales Execs */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Top Sales Executives</h3>
          </div>
          {topExecs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No conversions yet</p>
          ) : (
            <div className="space-y-2">
              {topExecs.map((e, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                  }`}>{i + 1}</span>
                  <span className="text-sm text-slate-700 flex-1">{e.name}</span>
                  <span className="text-sm font-bold text-slate-800">{e.count} converted</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Leads */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Today's New Leads</h3>
            </div>
            <button onClick={onNavigateLeads} className="text-xs text-sky-600 font-medium hover:underline">View all</button>
          </div>
          {newLeads.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No new leads today</p>
          ) : (
            <div className="space-y-2">
              {newLeads.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{l.hotel_name || l.contact_person}</p>
                    <p className="text-xs text-slate-400">{l.city} · {l.num_rooms} rooms</p>
                  </div>
                  <Badge color="sky">{l.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Critical Alerts */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Critical Alerts</h3>
        </div>
        <div className="space-y-2">
          {expired.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2">
              <Ban className="w-4 h-4" /> {expired.length} hotel(s) have expired subscriptions
            </div>
          )}
          {suspended.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-orange-700 bg-orange-50 rounded-lg p-2">
              <Ban className="w-4 h-4" /> {suspended.length} hotel(s) are suspended
            </div>
          )}
          {openTickets.filter((t) => t.priority === 'Critical').length > 0 && (
            <button onClick={onNavigateTickets} className="w-full flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2 text-left">
              <Ticket className="w-4 h-4" /> {openTickets.filter((t) => t.priority === 'Critical').length} critical support ticket(s) open
            </button>
          )}
          {expired.length === 0 && suspended.length === 0 && openTickets.filter((t) => t.priority === 'Critical').length === 0 && (
            <p className="text-sm text-slate-400 text-center py-2">No critical alerts</p>
          )}
        </div>
      </Card>
    </div>
  );
};
