import { useEffect, useState, useCallback, useMemo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getDashboardSummary } from '@/lib/api';
import type { DashboardSummary } from '@/lib/api';
import { getDayWiseRevenue, type DayWiseRevenueData } from '@/lib/api-revenue';
import { getTodayLocal, addDays } from '@/lib/calc';
import { useAuth } from '@/lib/auth';

import { DashboardContextBar, type RevenueDateFilter } from '@/components/dashboard/DashboardContextBar';
import { KpiSection } from '@/components/dashboard/KpiSection';
import { FinancialOverview } from '@/components/dashboard/FinancialOverview';
import { AnalyticsOverview } from '@/components/dashboard/AnalyticsOverview';
import { OperationalSummaryStrip } from '@/components/dashboard/OperationalSummaryStrip';
import { RoomChartPreviewSection } from '@/components/dashboard/RoomChartPreviewSection';
import { YtdAndBookingSources } from '@/components/dashboard/YtdAndBookingSources';
import { QuickActionsToolbar } from '@/components/dashboard/QuickActionsToolbar';
import { DailyRevenueHistoryModal } from '@/components/dashboard/DailyRevenueHistoryModal';

interface DashboardProps {
  onNavigate: (screen: string, payload?: unknown) => void;
}

export const Dashboard = ({ onNavigate }: DashboardProps) => {
  const { role } = useAuth();
  void role; // Available for staff specific conditionals if needed
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayLocal(), []);
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Date filter state
  const [dateFilter, setDateFilter] = useState<RevenueDateFilter>('today');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [rangeStart, setRangeStart] = useState<string>(todayStr.slice(0, 7) + '-01');
  const [rangeEnd, setRangeEnd] = useState<string>(todayStr);

  const [periodRevenue, setPeriodRevenue] = useState<DayWiseRevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyModalDate, setHistoryModalDate] = useState<string | undefined>(undefined);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPeriodRevenue = useCallback(async () => {
    try {
      setRevenueLoading(true);
      let res: DayWiseRevenueData;
      if (dateFilter === 'today') {
        res = await getDayWiseRevenue({ date: todayStr });
        setSelectedDate(todayStr);
      } else if (dateFilter === 'yesterday') {
        const yStr = addDays(todayStr, -1);
        res = await getDayWiseRevenue({ date: yStr });
        setSelectedDate(yStr);
      } else if (dateFilter === 'custom_date') {
        res = await getDayWiseRevenue({ date: selectedDate });
      } else if (dateFilter === 'range') {
        res = await getDayWiseRevenue({ startDate: rangeStart, endDate: rangeEnd });
      } else if (dateFilter === 'mtd') {
        const now = new Date();
        res = await getDayWiseRevenue({ month: now.getMonth() + 1, year: now.getFullYear() });
      } else if (dateFilter === 'last_month') {
        const lm = new Date();
        lm.setMonth(lm.getMonth() - 1);
        res = await getDayWiseRevenue({ month: lm.getMonth() + 1, year: lm.getFullYear() });
      } else {
        res = await getDayWiseRevenue({ date: todayStr });
      }
      setPeriodRevenue(res);
    } catch (e) {
      console.warn('[Dashboard] Day-wise revenue calculation fallback:', e);
    } finally {
      setRevenueLoading(false);
    }
  }, [dateFilter, selectedDate, rangeStart, rangeEnd, todayStr]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadPeriodRevenue();
  }, [loadPeriodRevenue]);

  const handleFilterChange = (filter: RevenueDateFilter, custom?: { date?: string; start?: string; end?: string }) => {
    setDateFilter(filter);
    if (custom?.date) setSelectedDate(custom.date);
    if (custom?.start) setRangeStart(custom.start);
    if (custom?.end) setRangeEnd(custom.end);
  };

  const handleOpenHistory = (dateToOpen?: string) => {
    setHistoryModalDate(dateToOpen || selectedDate);
    setShowHistoryModal(true);
  };

  const mtd = summary?.mtd ?? null;
  const ytd = summary?.ytd ?? null;
  const lastClosedDate = summary?.lastClosedDate ?? null;
  const ranking = summary?.ranking ?? [];
  const roomPreview = summary?.roomPreview ?? { categories: [] };
  const opsToday = summary?.opsToday ?? { arrivals: 0, departures: 0, inHouse: 0, available: 0, occupied: 0, dueCheckouts: 0, todayCheckins: 0 };

  const isTodayOpen = periodRevenue?.dailyBreakdown?.[0]?.businessDateStatus !== 'closed';

  // Subtitle for active period
  const periodSubtitle = useMemo(() => {
    if (dateFilter === 'today') return `Earned Revenue • Business Date: ${todayStr}`;
    if (dateFilter === 'yesterday') return `Earned Revenue • Business Date: ${selectedDate}`;
    if (dateFilter === 'custom_date') return `Earned Revenue • Business Date: ${selectedDate}`;
    if (dateFilter === 'range') return `Earned Revenue • ${rangeStart} → ${rangeEnd}`;
    if (dateFilter === 'mtd') return `MTD Earned Revenue • ${monthName}`;
    if (dateFilter === 'last_month') return 'Last Month Earned Revenue';
    return 'Earned Revenue';
  }, [dateFilter, todayStr, selectedDate, rangeStart, rangeEnd, monthName]);

  const periodBadge = useMemo(() => {
    if (dateFilter === 'today') return isTodayOpen ? 'Open Date' : 'Closed';
    if (dateFilter === 'mtd') return 'MTD Accrual';
    return 'Accrual';
  }, [dateFilter, isTodayOpen]);

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
            onClick={() => { loadSummary(); loadPeriodRevenue(); }}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl transition-all active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* 1. Context & Date Filter Toolbar */}
      <DashboardContextBar
        monthName={monthName}
        lastClosedDate={lastClosedDate}
        activeFilter={dateFilter}
        onFilterChange={handleFilterChange}
        selectedDate={selectedDate}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onOpenHistory={handleOpenHistory}
        isOpenBusinessDate={isTodayOpen}
      />

      {/* 2. KPI Summary Cards (8 Cards) - Reflects active day / range revenue */}
      <KpiSection
        mtd={mtd}
        periodTotalRevenue={periodRevenue?.summary.totalIncome}
        periodSub={
          dateFilter === 'today'
            ? `${todayStr} (${isTodayOpen ? 'Open Date' : 'Closed'})`
            : dateFilter === 'mtd'
            ? 'MTD Earned Revenue'
            : periodSubtitle
        }
        periodCash={periodRevenue?.summary.collections.cash}
        periodBank={periodRevenue?.summary.collections.bank}
        periodArr={periodRevenue?.summary.arr}
        periodRevpar={periodRevenue?.summary.revpar}
        periodOcc={periodRevenue?.summary.occupancyPercent}
      />

      {/* 3. Financial Breakdown Cards (4 Cards) - With Day-Wise Breakup & History Drilldown */}
      <FinancialOverview
        mtd={mtd}
        periodSummary={periodRevenue?.summary}
        periodSubtitle={periodSubtitle}
        periodBadge={periodBadge}
        onOpenHistory={() => handleOpenHistory(selectedDate)}
        onDrilldownRoomRevenue={() => handleOpenHistory(selectedDate)}
      />

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

      {/* Dedicated Day-Wise Revenue History Modal */}
      <DailyRevenueHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        initialDate={historyModalDate || selectedDate}
        initialStartDate={rangeStart}
        initialEndDate={rangeEnd}
      />
    </div>
  );
};
