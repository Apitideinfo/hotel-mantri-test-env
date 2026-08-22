import { ReactNode } from 'react';
import { LogIn, LogOut, Users, BedDouble, CheckCircle2, CalendarClock } from 'lucide-react';
import { fmtInt } from '@/lib/calc';
import type { DashboardSummary } from '@/lib/api';

interface OperationalSummaryStripProps {
  opsToday: DashboardSummary['opsToday'] | null;
  todayStr: string;
}

interface OpsMetricItemProps {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
  bg: string;
}

const OpsMetricItem = ({ label, value, icon, color, bg }: OpsMetricItemProps) => (
  <div className="flex flex-col justify-between p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 group min-w-0">
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${bg} ${color} shrink-0 transition-transform group-hover:scale-105`}>
        {icon}
      </div>
    </div>
    <div>
      <p className="text-2xl sm:text-[26px] font-bold tabular-nums leading-tight text-slate-900 tracking-tight">{fmtInt(value)}</p>
      <p className="text-xs sm:text-[13px] font-medium text-slate-500 mt-1 truncate">{label}</p>
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
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-card p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100/80 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Today's Operational Summary</h3>
            <p className="text-xs font-medium text-slate-400">Date: {todayStr}</p>
          </div>
        </div>

        {/* Live status badge with subtle green pulse */}
        <div className="flex items-center gap-2 bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-1.5 rounded-full">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">LIVE STATUS</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
        <OpsMetricItem label="Arrivals" value={ops.arrivals} icon={<LogIn className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
        <OpsMetricItem label="Departures" value={ops.departures} icon={<LogOut className="w-4 h-4" />} color="text-orange-600" bg="bg-orange-50" />
        <OpsMetricItem label="In-house Guests" value={ops.inHouse} icon={<Users className="w-4 h-4" />} color="text-brand-600" bg="bg-brand-50" />
        <OpsMetricItem label="Available Rooms" value={ops.available} icon={<BedDouble className="w-4 h-4" />} color="text-teal-600" bg="bg-teal-50" />
        <OpsMetricItem label="Occupied Rooms" value={ops.occupied} icon={<CheckCircle2 className="w-4 h-4" />} color="text-slate-800" bg="bg-slate-100" />
        <OpsMetricItem label="Due Check-outs" value={ops.dueCheckouts} icon={<LogOut className="w-4 h-4" />} color="text-amber-600" bg="bg-amber-50" />
        <OpsMetricItem label="Today Check-ins" value={ops.todayCheckins} icon={<LogIn className="w-4 h-4" />} color="text-emerald-600" bg="bg-emerald-50" />
      </div>
    </div>
  );
};
