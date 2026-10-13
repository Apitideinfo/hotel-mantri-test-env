import { useState, useEffect, useCallback } from 'react';
import {
  Users, Star, Building2, Plane, Award, TrendingUp, Cake, Heart,
  AlertCircle, Loader2, ArrowRight, Phone, Gift,
} from 'lucide-react';
import type { GuestInsights } from '@/lib/types-crm';
import { getGuestInsights } from '@/lib/api-crm';

interface CrmHubProps {
  onNavigate: (screen: string) => void;
  onBack: () => void;
}

export const CrmHub = ({ onNavigate, onBack }: CrmHubProps) => {
  const [insights, setInsights] = useState<GuestInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGuestInsights();
      setInsights(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const MENU_ITEMS = [
    { key: 'crm-directory', label: 'Guest Directory', icon: Users, desc: 'All guest profiles', color: 'bg-brand-50 text-brand-600' },
    { key: 'crm-vip', label: 'VIP Guests', icon: Star, desc: 'VIP & celebrity guests', color: 'bg-brand-gold-50 text-brand-gold-600' },
    { key: 'crm-corporate', label: 'Corporate Guests', icon: Building2, desc: 'Company profiles & rates', color: 'bg-blue-50 text-blue-600' },
    { key: 'crm-agents', label: 'Travel Agents', icon: Plane, desc: 'Agent commission tracking', color: 'bg-teal-50 text-teal-600' },
    { key: 'crm-loyalty', label: 'Loyalty Program', icon: Award, desc: 'Points & rewards', color: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">Guest CRM</h1>
          <p className="text-xs text-slate-400">Guest profiles, loyalty & insights</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Menu cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 text-left hover:shadow-card-hover hover:border-slate-300 hover:-translate-y-0.5 transition-all duration-200 group cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}>
              <item.icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-900 group-hover:text-sky-600 transition-colors">{item.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            <div className="flex items-center gap-1 mt-3 text-xs font-semibold text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Open Directory <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>

      {/* Insights */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading insights…
        </div>
      ) : insights ? (
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Automatic Guest Insights</h2>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InsightCard label="Total Guests" value={insights.totalGuests.toString()} icon={Users} color="text-sky-600 bg-sky-50 border-sky-100" />
            <InsightCard label="VIP Guests" value={insights.vipCount.toString()} icon={Star} color="text-amber-600 bg-amber-50 border-amber-100" />
            <InsightCard label="Repeat Guest %" value={`${insights.repeatGuestPercent}%`} icon={TrendingUp} color="text-emerald-600 bg-emerald-50 border-emerald-100" />
            <InsightCard label="Corporate Revenue" value={`₹${Math.round(insights.corporateRevenue).toLocaleString('en-IN')}`} icon={Building2} color="text-blue-600 bg-blue-50 border-blue-100" />
          </div>

          {/* Top guests */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {insights.highestSpendingGuest && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Highest Spending Guest</p>
                <p className="text-lg font-black text-slate-900 tracking-tight">{insights.highestSpendingGuest.name}</p>
                <p className="text-sm text-emerald-600 font-bold mt-0.5">₹{Math.round(insights.highestSpendingGuest.revenue).toLocaleString('en-IN')} Lifetime</p>
              </div>
            )}
            {insights.mostFrequentGuest && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Most Frequent Guest</p>
                <p className="text-lg font-black text-slate-900 tracking-tight">{insights.mostFrequentGuest.name}</p>
                <p className="text-sm text-sky-600 font-bold mt-0.5">{insights.mostFrequentGuest.stays} stays completed</p>
              </div>
            )}
          </div>

          {/* Upcoming birthdays & anniversaries */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cake className="w-4 h-4 text-rose-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Upcoming Birthdays</p>
              </div>
              {insights.upcomingBirthdays.length === 0 ? (
                <p className="text-xs text-slate-400">None in the next 30 days</p>
              ) : (
                <div className="space-y-2">
                  {insights.upcomingBirthdays.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                      <span className="font-medium text-slate-700">{b.name}</span>
                      <span className="text-xs font-semibold text-slate-500">{new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="w-4 h-4 text-rose-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Upcoming Anniversaries</p>
              </div>
              {insights.upcomingAnniversaries.length === 0 ? (
                <p className="text-xs text-slate-400">None in the next 30 days</p>
              ) : (
                <div className="space-y-2">
                  {insights.upcomingAnniversaries.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                      <span className="font-medium text-slate-700">{a.name}</span>
                      <span className="text-xs font-semibold text-slate-500">{new Date(a.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Guests not returned */}
          {insights.guestsNotReturned.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Guests Not Returned (90+ days)</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {insights.guestsNotReturned.map((g, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-medium text-slate-700 truncate">{g.name}</span>
                    <span className="text-xs text-amber-600 font-bold shrink-0">{g.daysSince}d ago</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

const InsightCard = ({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  color: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 hover:shadow-card-hover transition-all duration-200 p-4">
    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center mb-2.5 ${color}`}>
      <Icon className="w-4 h-4" />
    </div>
    <p className="text-lg sm:text-xl font-black text-slate-900 tabular-nums tracking-tight">{value}</p>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">{label}</p>
  </div>
);
