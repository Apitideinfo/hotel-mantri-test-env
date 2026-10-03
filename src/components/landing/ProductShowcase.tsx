import React, { useState } from 'react';
import {
  TrendingUp,
  Bed,
  Users,
  CheckCircle2,
  ArrowUpRight,
  Sparkles,
  Calendar,
  IndianRupee,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export const ProductShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'revenue' | 'staff'>('rooms');

  const rooms = [
    { num: '101', type: 'Deluxe AC', guest: 'Rahul Verma', status: 'Occupied', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { num: '102', type: 'Super Deluxe', guest: 'Rashmi Sahoo', status: 'Occupied', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { num: '103', type: 'Executive Suite', guest: 'Vacant (Clean)', status: 'Available', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { num: '104', type: 'Standard Room', guest: 'Amit Patel', status: 'Occupied', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { num: '105', type: 'Family Suite', guest: 'Cleaning in Progress', status: 'Housekeeping', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { num: '201', type: 'Deluxe AC', guest: 'Vacant (Clean)', status: 'Available', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { num: '202', type: 'Executive Suite', guest: 'Sujit Dash', status: 'Occupied', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { num: '203', type: 'Super Deluxe', guest: 'Vikram Mehta', status: 'Occupied', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ];

  return (
    <section
      id="product"
      className="relative w-full py-20 lg:py-28 bg-[#fafafa] text-slate-900 select-none overflow-hidden border-b border-gray-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Section Header ── */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase">
            LIVE PLATFORM
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-[50px] font-extrabold text-black tracking-tight leading-[1.12] mt-2 mb-3">
            See HotelMantri in Action
          </h2>
          <p className="text-gray-600 text-base sm:text-lg font-normal leading-relaxed">
            Experience real-time room status, express guest folios, and automated revenue insights.
          </p>
        </div>

        {/* ── Interactive Live Dashboard Frame ── */}
        <div className="bg-white rounded-3xl border border-gray-200/90 shadow-[0_20px_60px_rgba(0,0,0,0.06)] overflow-hidden">
          
          {/* Dashboard Header Bar */}
          <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-rose-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-xs font-bold text-gray-400 ml-2">HotelMantri PMS • Grand Royal Residency</span>
            </div>

            {/* Dashboard Tabs */}
            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('rooms')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'rooms' ? 'bg-white text-black shadow-sm' : 'text-gray-600 hover:text-black'
                }`}
              >
                Room Operations
              </button>
              <button
                onClick={() => setActiveTab('revenue')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'revenue' ? 'bg-white text-black shadow-sm' : 'text-gray-600 hover:text-black'
                }`}
              >
                Live Revenue
              </button>
              <button
                onClick={() => setActiveTab('staff')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'staff' ? 'bg-white text-black shadow-sm' : 'text-gray-600 hover:text-black'
                }`}
              >
                Staff Shift
              </button>
            </div>
          </div>

          {/* 4 Live Mini KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border-b border-gray-100">
            <div className="p-5 sm:p-6 bg-white flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Today Revenue</span>
                <IndianRupee className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-black">₹2,48,500</div>
              <span className="text-[11px] font-semibold text-emerald-600 mt-1">↑ +14.2% vs yesterday</span>
            </div>

            <div className="p-5 sm:p-6 bg-white flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Occupancy</span>
                <Bed className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-black">87.5%</div>
              <span className="text-[11px] font-semibold text-blue-600 mt-1">28 of 32 rooms booked</span>
            </div>

            <div className="p-5 sm:p-6 bg-white flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Active Bookings</span>
                <Calendar className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-black">18 Guests</div>
              <span className="text-[11px] font-semibold text-gray-500 mt-1">6 Arrivals • 4 Departures</span>
            </div>

            <div className="p-5 sm:p-6 bg-white flex flex-col justify-between">
              <div className="flex items-center justify-between text-gray-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Housekeeping</span>
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-black">100% Clean</div>
              <span className="text-[11px] font-semibold text-emerald-600 mt-1">All rooms inspected</span>
            </div>
          </div>

          {/* Interactive Room Grid Display */}
          <div className="p-6 sm:p-8 bg-[#fcfcfd]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-base">Live Room Timeline Grid</h3>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Occupied</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Available</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Cleaning</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {rooms.map((rm) => (
                <div
                  key={rm.num}
                  className="bg-white p-4 rounded-2xl border border-gray-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-base text-gray-900">Room {rm.num}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${rm.color}`}>
                      {rm.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-medium">{rm.type}</div>
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-700 font-semibold">
                    <span>{rm.guest}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
