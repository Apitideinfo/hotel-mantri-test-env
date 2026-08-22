import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getDashboardSummary } from '@/lib/api';
import type { DashboardSummary } from '@/lib/api';
import { getTodayLocal } from '@/lib/calc';
import { useAuth } from '@/lib/auth';

import { DashboardContextBar } from '@/components/dashboard/DashboardContextBar';
import { KpiSection } from '@/components/dashboard/KpiSection';
import { FinancialOverview } from '@/components/dashboard/FinancialOverview';
import { AnalyticsOverview } from '@/components/dashboard/AnalyticsOverview';
import { OperationalSummaryStrip } from '@/components/dashboard/OperationalSummaryStrip';
import { RoomChartPreviewSection } from '@/components/dashboard/RoomChartPreviewSection';
import { YtdAndBookingSources } from '@/components/dashboard/YtdAndBookingSources';
import { QuickActionsToolbar } from '@/components/dashboard/QuickActionsToolbar';

interface DashboardProps {
  onNavigate: (screen: string, payload?: unknown) => void;
}

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { role } = useAuth();
  void role; // Available for staff specific conditionals if needed
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayStr = getTodayLocal();
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mtd = summary?.mtd ?? null;
  const ytd = summary?.ytd ?? null;
  const lastClosedDate = summary?.lastClosedDate ?? null;
  const ranking = summary?.ranking ?? [];
  const roomPreview = summary?.roomPreview ?? { categories: [] };
  const opsToday = summary?.opsToday ?? { arrivals: 0, departures: 0, inHouse: 0, available: 0, occupied: 0, dueCheckouts: 0, todayCheckins: 0 };

  // Skeleton loading state
  if (loading && !summary) {
    return (
      <div className="px-4 lg:px-8 py-6 w-full max-w-[1600px] mx-auto space-y-6 animate-pulse">
        <div className="h-12 bg-slate-200/80 rounded-2xl w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/80 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-44 bg-slate-200/80 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 bg-slate-200/80 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 w-full max-w-[1600px] mx-auto space-y-6 animate-page-fade">
      {/* Error Retry Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-2xl p-4 flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* 1. Context & Date Filter Toolbar */}
      <DashboardContextBar monthName={monthName} lastClosedDate={lastClosedDate} />

      {/* 2. KPI Summary Cards (8 Cards) */}
      <KpiSection mtd={mtd} />

      {/* 3. Financial Breakdown Cards (3 Cards) */}
      <FinancialOverview mtd={mtd} />

      {/* 4. Analytics & Charts (3 Cards) */}
      <AnalyticsOverview summary={summary} />

      {/* 5. Today's Operational Summary (7 Status Metrics) */}
      <OperationalSummaryStrip opsToday={opsToday} todayStr={todayStr} />

      {/* 6. Room Chart Preview Section */}
      <RoomChartPreviewSection roomPreview={roomPreview} todayStr={todayStr} onNavigate={onNavigate} />

      {/* 7. YTD Summary + Top Booking Sources (2 Columns) */}
      <YtdAndBookingSources ytd={ytd} ranking={ranking} />

      {/* 8. Quick Actions Toolbar (8 Action Buttons) */}
      <QuickActionsToolbar onNavigate={onNavigate} todayStr={todayStr} />
    </div>
  );
};
