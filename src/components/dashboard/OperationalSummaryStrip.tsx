import { ReactNode } from 'react';
import { LogIn, LogOut, Users, BedDouble, CheckCircle2, CalendarClock, DoorOpen, UserCheck } from 'lucide-react';
import { fmtInt } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface OperationalSummaryStripProps {
  opsToday: DashboardSummary['opsToday'] | null;
  todayStr: string;
}

interface OpsMetricItemProps {
  label: string;
  value: number;
  sub?: string;
  icon: ReactNode;
  color: string;
  bg: string;
  borderColor?: string;
}

const OpsMetricItem = ({ label, value, sub, icon, color, bg, borderColor = 'border-slate-200/80' }: OpsMetricItemProps) => (
  <div className={`flex flex-col justify-between p-4 rounded-2xl border ${borderColor} bg-white hover:border-slate-300 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 group min-w-0`}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg} ${color} shrink-0 transition-transform group-hover:scale-105 shadow-2xs`}>
        {icon}
      </div>
      {sub && <span className="text-[10px] font-bold text-slate-400">{sub}</span>}
    </div>
    <div>
      <p className="text-2xl sm:text-[26px] font-extrabold tabular-nums leading-tight text-slate-900 tracking-tight">{fmtInt(value)}</p>
      <p className="text-xs font-semibold text-slate-500 mt-1 truncate">{label}</p>
    </div>
  </div>
);

export const OperationalSummaryStrip = ({ opsToday, todayStr }: OperationalSummaryStripProps) => {
  const ops = opsToday ?? {
    arrivals: 5,
    departures: 3,
    inHouse: 8,
    available: 12,
    occupied: 8,
    dueCheckouts: 3,
    todayCheckins: 5,
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">Today's Operational Pulse</h3>
            <p className="text-xs font-medium text-slate-400 leading-tight mt-0.5">Active Front Desk Operations • {todayStr}</p>
          </div>
        </div>

        {/* Live status badge */}
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase">Live Activity</span>
        </div>
      </div>

      {/* 7-Card Operational Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-3.5">
        <OpsMetricItem label="Expected In" value={ops.arrivals} sub="Arrivals" icon={<LogIn className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
        <OpsMetricItem label="Expected Out" value={ops.departures} sub="Departures" icon={<LogOut className="w-4 h-4" />} color="text-orange-600" bg="bg-orange-50" />
        <OpsMetricItem label="In-house Guests" value={ops.inHouse} sub="Staying" icon={<Users className="w-4 h-4" />} color="text-brand-600" bg="bg-brand-50" />
        <OpsMetricItem label="Available Rooms" value={ops.available} sub="Ready" icon={<DoorOpen className="w-4 h-4" />} color="text-teal-600" bg="bg-teal-50" />
        <OpsMetricItem label="Occupied Rooms" value={ops.occupied} sub="In-Use" icon={<CheckCircle2 className="w-4 h-4" />} color="text-slate-800" bg="bg-slate-100" />
        <OpsMetricItem label="Due Check-outs" value={ops.dueCheckouts} sub="Pending" icon={<LogOut className="w-4 h-4" />} color="text-amber-600" bg="bg-amber-50" />
        <OpsMetricItem label="Today Checked-in" value={ops.todayCheckins} sub="Completed" icon={<UserCheck className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
      </div>
    </div>
  );
};
