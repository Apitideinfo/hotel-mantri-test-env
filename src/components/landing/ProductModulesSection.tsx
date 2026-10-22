import React from 'react';
import {
  Calendar, LayoutGrid, Radio, Sparkles, Wallet, BarChart3,
  UtensilsCrossed, Shirt, ArrowRight, CheckCircle2, TrendingUp, IndianRupee
} from 'lucide-react';

interface ProductModulesProps {
  onOpenBookDemo?: () => void;
}

export const ProductModulesSection: React.FC<ProductModulesProps> = ({ onOpenBookDemo }) => {
  return (
    <section id="modules" className="py-20 sm:py-28 bg-white border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 sm:mb-16 gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold uppercase tracking-wider mb-3">
              Complete Hospitality Suite
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Powerful Modules for Complete Hotel Management
            </h2>
            <p className="text-base sm:text-lg text-slate-600 mt-2">
              Everything your hotel needs, in one connected platform.
            </p>
          </div>

          <button
            onClick={onOpenBookDemo}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700 hover:gap-2 transition-all cursor-pointer self-start md:self-end"
          >
            Explore All Features <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* 8 Modules Grid (4 cols on lg, 2 on md, 1 on sm) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Module 1: PMS & Reservations */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-blue-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">PMS & Reservations</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Create bookings in seconds and keep your room inventory automatically updated.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-2 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">New Booking #1042</span>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <div className="space-y-1 text-[10px] text-slate-600">
                <div className="flex justify-between">
                  <span>Guest: <b>Rohan Mehra</b></span>
                  <span className="text-blue-600 font-semibold">Deluxe AC</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>14 Oct - 17 Oct (3N)</span>
                  <span className="font-bold text-slate-900">₹7,500</span>
                </div>
              </div>
              <div className="pt-1 flex items-center justify-between text-[9px] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                <span className="text-slate-500">Payment: UPI Received</span>
                <span className="font-bold text-emerald-600">Paid</span>
              </div>
            </div>
          </div>

          {/* Module 2: Operations Board */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-amber-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Operations Board</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                See entire hotel room status at a glance. Vacant, occupied, cleaning, blocked.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup (Color Coded Room Grid) */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Live Room Grid (Floor 1 & 2)</span>
                <span className="text-[9px] text-slate-400">22 Rooms</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded p-1 text-[9px] font-bold">101 Cln</div>
                <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded p-1 text-[9px] font-bold">102 Occ</div>
                <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded p-1 text-[9px] font-bold">103 Dty</div>
                <div className="bg-yellow-50 text-yellow-800 border border-yellow-200 rounded p-1 text-[9px] font-bold">104 Clg</div>
                <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded p-1 text-[9px] font-bold">201 Occ</div>
                <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded p-1 text-[9px] font-bold">202 Rdy</div>
                <div className="bg-slate-100 text-slate-600 border border-slate-200 rounded p-1 text-[9px] font-bold">203 Blk</div>
                <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded p-1 text-[9px] font-bold">204 Occ</div>
              </div>
              <div className="text-[9px] text-slate-500 text-center font-medium">Click room for instant check-in/actions</div>
            </div>
          </div>

          {/* Module 3: Channel Manager */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-sky-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 text-sky-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Channel Manager</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Sync rates and inventory with multiple OTAs from one place.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Connected OTAs</span>
                <span className="text-[9px] font-bold text-emerald-600">● 5 Online</span>
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="flex items-center justify-between p-1 bg-slate-50 rounded">
                  <span className="font-bold text-blue-900">Booking.com</span>
                  <span className="text-slate-600">₹2,800 · 4 Avail</span>
                </div>
                <div className="flex items-center justify-between p-1 bg-slate-50 rounded">
                  <span className="font-bold text-rose-600">MakeMyTrip</span>
                  <span className="text-slate-600">₹2,800 · 4 Avail</span>
                </div>
                <div className="flex items-center justify-between p-1 bg-slate-50 rounded">
                  <span className="font-bold text-amber-700">Agoda</span>
                  <span className="text-slate-600">₹2,800 · 4 Avail</span>
                </div>
              </div>
              <div className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-center font-bold">
                Auto-sync on every booking
              </div>
            </div>
          </div>

          {/* Module 4: Housekeeping */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-teal-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-teal-100 border border-teal-200 text-teal-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Housekeeping</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Assign rooms, track cleaning status and keep operations smooth.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Cleaning Queue</span>
                <span className="text-[9px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded font-bold">Mobile View</span>
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="p-1 rounded bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span>Room 102 (Dirty)</span>
                  <span className="font-bold text-yellow-700 bg-yellow-100 px-1 rounded">Cleaning</span>
                </div>
                <div className="p-1 rounded bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span>Room 105 (Ready)</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-1 rounded">Inspected</span>
                </div>
                <div className="p-1 rounded bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span>Room 203 (Check-out)</span>
                  <span className="font-bold text-amber-700 bg-amber-100 px-1 rounded">Assigned</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 text-center font-medium">Auto-notifies front desk on ready</div>
            </div>
          </div>

          {/* Module 5: Finance & Day Closing */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-emerald-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Wallet className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Finance & Day Closing</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Know your revenue, collection, expenses and cash closing every day.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Daily Cash Closing</span>
                <span className="text-[9px] font-bold text-emerald-600">Reconciled</span>
              </div>
              <div className="space-y-1 text-[9px] text-slate-700">
                <div className="flex justify-between">
                  <span>Room Revenue</span>
                  <span className="font-bold text-slate-900">₹72,000</span>
                </div>
                <div className="flex justify-between">
                  <span>Restaurant & POS</span>
                  <span className="font-bold text-slate-900">₹14,500</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Daily Expenses</span>
                  <span className="font-bold">-₹5,500</span>
                </div>
                <div className="pt-1 border-t border-slate-100 flex justify-between font-extrabold text-emerald-700">
                  <span>Net Daily Closing</span>
                  <span>₹81,000</span>
                </div>
              </div>
            </div>
          </div>

          {/* Module 6: Reports */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-purple-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Reports</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Occupancy, revenue, arrival, departures and more — detailed reports for better decisions.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <span className="text-[10px] font-bold text-slate-800">Occupancy & ADR Trend</span>
                <span className="text-[9px] text-purple-600 font-bold">This Month</span>
              </div>
              {/* Mini Bar Chart */}
              <div className="h-10 flex items-end gap-1 px-1 justify-between pt-1">
                <div className="w-full bg-purple-200 rounded-t h-[40%]" />
                <div className="w-full bg-purple-300 rounded-t h-[65%]" />
                <div className="w-full bg-purple-400 rounded-t h-[50%]" />
                <div className="w-full bg-purple-500 rounded-t h-[80%]" />
                <div className="w-full bg-purple-600 rounded-t h-[95%]" />
                <div className="w-full bg-purple-500 rounded-t h-[75%]" />
                <div className="w-full bg-purple-600 rounded-t h-[88%]" />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 font-medium">
                <span>Avg Occ: <b>78.4%</b></span>
                <span>ADR: <b>₹3,150</b></span>
              </div>
            </div>
          </div>

          {/* Module 7: Restaurant POS */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-rose-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Restaurant POS</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Manage restaurant billing, menu, KOT and room service orders with one click.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Restaurant Tables</span>
                <span className="text-[9px] font-bold text-rose-600">Live KOT</span>
              </div>
              <div className="space-y-1 text-[9px]">
                <div className="p-1 bg-slate-50 rounded flex justify-between">
                  <span>Table 04 (3 Pax)</span>
                  <span className="font-bold text-amber-600">KOT Sent</span>
                </div>
                <div className="p-1 bg-slate-50 rounded flex justify-between">
                  <span>Table 07 (2 Pax)</span>
                  <span className="font-bold text-emerald-600">Billed ₹1,420</span>
                </div>
                <div className="p-1 bg-slate-50 rounded flex justify-between">
                  <span>Room 102 (Room Svc)</span>
                  <span className="font-bold text-blue-600">Posted to Room</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 text-center font-medium">Direct billing to room folio supported</div>
            </div>
          </div>

          {/* Module 8: Laundry & Linen */}
          <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-5 flex flex-col justify-between hover:border-cyan-400 hover:shadow-lg transition-all duration-200 group">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-100 border border-cyan-200 text-cyan-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                <Shirt className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Laundry & Linen</h3>
              <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed">
                Track room linen, guest laundry and complete laundry flow seamlessly.
              </p>
            </div>

            {/* Mini UI Screenshot Mockup */}
            <div className="mt-5 bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[10px] font-bold text-slate-800">Linen & Laundry Tracker</span>
                <span className="text-[9px] text-cyan-700 bg-cyan-50 px-1 rounded font-bold">In-House</span>
              </div>
              <div className="space-y-1 text-[9px] text-slate-600">
                <div className="flex justify-between p-1 bg-slate-50 rounded">
                  <span>Bed Sheets</span>
                  <span className="font-bold text-slate-900">42 In Wash · 60 Ready</span>
                </div>
                <div className="flex justify-between p-1 bg-slate-50 rounded">
                  <span>Bath Towels</span>
                  <span className="font-bold text-slate-900">18 In Wash · 45 Ready</span>
                </div>
                <div className="flex justify-between p-1 bg-slate-50 rounded">
                  <span>Guest Laundry #402</span>
                  <span className="font-bold text-emerald-600">Ready to Deliver</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-500 text-center font-medium">Prevent linen shrinkage & loss</div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
