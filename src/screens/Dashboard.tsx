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

interface DashboardProps {
  onNavigate: (screen: string, payload?: unknown) => void;
}

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { role, hotelName } = useAuth();
  void role; // Available for staff specific conditionals if needed
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Date Filter & View Scope State
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocal());
  const [viewScope, setViewScope] = useState<'daily' | 'mtd'>('daily');

  const load = useCallback(async (dateToFetch?: string) => {
    try {
      setLoading(true);
      setError(null);
      const target = dateToFetch ?? selectedDate;
      const data = await getDashboardSummary(target);
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, []); // Initial mount

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    load(newDate);
  };

  // Compute month name dynamically from selected date
  const monthName = (() => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d || 1);
      return dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    } catch {
      return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
  })();

  const mtd = summary?.mtd ?? null;
  const ytd = summary?.ytd ?? null;
  const lastClosedDate = summary?.lastClosedDate ?? null;
  const ranking = summary?.ranking ?? [];
  const roomPreview = summary?.roomPreview ?? { categories: [] };
  const opsToday = summary?.opsToday ?? { arrivals: 0, departures: 0, inHouse: 0, available: 0, occupied: 0, dueCheckouts: 0, todayCheckins: 0 };
  const totalRooms = summary?.settings?.total_rooms || 20;

  // Skeleton loading state
  if (loading && !summary) {
    return (
      <div className="px-4 lg:px-8 py-6 w-full max-w-[1600px] mx-auto space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="h-28 bg-slate-200/70 rounded-2xl w-full" />

        {/* 4 Primary KPI cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 bg-slate-200/70 rounded-2xl" />
          ))}
        </div>

        {/* 4 Secondary KPI strip skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-200/70 rounded-xl" />
          ))}
        </div>

        {/* Financial overview 4 cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-52 bg-slate-200/70 rounded-2xl" />
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 bg-slate-200/70 rounded-2xl" />
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
            onClick={() => load()}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* 1. Context & Interactive Date Filter Toolbar */}
      <DashboardContextBar
        monthName={monthName}
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        viewScope={viewScope}
        onToggleScope={setViewScope}
        lastClosedDate={lastClosedDate}
        hotelName={hotelName}
        onRefresh={() => load()}
        isRefreshing={loading}
      />

      {/* 2. Tiered KPI Summary Cards (Daily Earned Revenue / MTD Revenue with live toggle) */}
      <KpiSection
        mtd={mtd}
        today={summary?.today}
        viewScope={viewScope}
        selectedDate={selectedDate}
        totalRooms={totalRooms}
        onToggleScope={setViewScope}
      />

      {/* 3. Financial Breakdown Cards (Daily Income & Collection / MTD Breakdown) */}
      <FinancialOverview
        mtd={mtd}
        today={summary?.today}
        viewScope={viewScope}
        selectedDate={selectedDate}
      />

      {/* 4. Analytics & Trend Visualizers (3 Cards) */}
      <AnalyticsOverview summary={summary} />

      {/* 5. Today's / Selected Date's Operational Pulse */}
      <OperationalSummaryStrip opsToday={opsToday} todayStr={selectedDate} />

      {/* 6. Room Inventory & Allocation Matrix Section */}
      <RoomChartPreviewSection roomPreview={roomPreview} todayStr={selectedDate} onNavigate={onNavigate} />

      {/* 7. YTD Executive Summary + Channel Leaderboard */}
      <YtdAndBookingSources ytd={ytd} ranking={ranking} />
    </div>
  );
};
