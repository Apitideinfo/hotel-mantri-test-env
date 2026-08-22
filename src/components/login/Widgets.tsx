import React from 'react';
import { Bed, Users, MessageSquare, TrendingUp } from 'lucide-react';

export const RevenueWidget: React.FC = () => (
  <div className="absolute -top-5 -left-3 sm:-left-6 bg-slate-900/85 backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 shadow-2xl shadow-black/40 w-44 sm:w-48 transition-all duration-300 hover:border-cyan-400/40 select-none animate-fade-in">
    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Total Revenue</p>
    <div className="flex items-baseline justify-between mt-1">
      <span className="text-lg font-black text-white tracking-tight">₹2,48,500</span>
      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-md">
        <TrendingUp className="w-2.5 h-2.5" /> 12.5%
      </span>
    </div>
    <svg className="w-full h-4 mt-1.5 text-emerald-400 overflow-visible" viewBox="0 0 100 20" fill="none">
      <path d="M0,18 Q25,10 50,14 T100,2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  </div>
);

export const RoomWidget: React.FC = () => (
  <div className="absolute -top-3 -right-3 sm:-right-6 bg-slate-900/85 backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 shadow-2xl shadow-black/40 w-44 sm:w-48 transition-all duration-300 hover:border-cyan-400/40 select-none animate-fade-in">
    <div className="flex items-center gap-2 mb-1">
      <div className="w-5 h-5 rounded-md bg-blue-500/20 flex items-center justify-center text-cyan-400 shrink-0">
        <Bed className="w-3 h-3" />
      </div>
      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Occupied Rooms</p>
    </div>
    <p className="text-lg font-black text-white tracking-tight mt-0.5">18 / 25</p>
    <div className="w-full h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full w-[72%]" />
    </div>
  </div>
);

export const StaffWidget: React.FC = () => (
  <div className="absolute -bottom-4 left-3 sm:left-6 bg-slate-900/85 backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5 shadow-2xl shadow-black/40 flex items-center gap-3 transition-all duration-300 hover:border-cyan-400/40 select-none animate-fade-in">
    <div className="w-7 h-7 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-300 shrink-0">
      <Users className="w-3.5 h-3.5" />
    </div>
    <div>
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Staff On Duty</p>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      </div>
      <p className="text-base font-black text-white leading-tight mt-0.5">6</p>
    </div>
  </div>
);

export const BookingWidget: React.FC = () => (
  <div className="absolute -bottom-4 right-3 sm:right-6 bg-slate-900/85 backdrop-blur-xl border border-white/20 rounded-2xl px-3.5 py-2.5 shadow-2xl shadow-black/40 flex items-center gap-3 transition-all duration-300 hover:border-cyan-400/40 select-none animate-fade-in">
    <div className="w-7 h-7 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
      <MessageSquare className="w-3.5 h-3.5" />
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">New Bookings</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-base font-black text-white leading-tight">12</span>
        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-md">+ 20%</span>
      </div>
    </div>
  </div>
);


