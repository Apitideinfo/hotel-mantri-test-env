import React, { useState } from 'react';
import {
  Calendar, LayoutGrid, Radio, Sparkles, Wallet, BarChart3,
  UtensilsCrossed, ArrowRight, CheckCircle2, TrendingUp, IndianRupee,
  Clock, ShieldCheck, QrCode, FileText, Moon, Smartphone, Check,
  ChevronRight, Users, Bell
} from 'lucide-react';

interface ProductModulesProps {
  onOpenBookDemo?: () => void;
}

type CategoryType = 'all' | 'frontdesk' | 'channels' | 'pos' | 'finance';

export const ProductModulesSection: React.FC<ProductModulesProps> = ({ onOpenBookDemo }) => {
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [activeRoomGrid, setActiveRoomGrid] = useState<number>(204);

  const CATEGORIES = [
    { id: 'all', label: 'All Modules (8)' },
    { id: 'frontdesk', label: 'Front Desk & Rooms' },
    { id: 'channels', label: 'OTA Distribution' },
    { id: 'pos', label: 'Restaurant & F&B' },
    { id: 'finance', label: 'Finance & Compliance' },
  ];

  const MODULES = [
    {
      id: 'pms',
      category: 'frontdesk',
      title: 'PMS & Smart Front Desk',
      badge: 'Core Engine',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: Calendar,
      iconColor: 'bg-blue-600 text-white shadow-blue-500/20',
      tagline: 'Create reservations in 20 seconds with instant WhatsApp voucher dispatch.',
      features: ['1-Tap Check-In / Check-Out', 'Digital ID & Aadhaar Capture', 'Group Rooming Lists'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2.5 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-black text-slate-900">Booking #HM-1048</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Checked-In
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-800">Rohan Mehra (2 Adults)</span>
              <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                Room 204 · Deluxe
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500">
              <span>25 Oct - 28 Oct (3 Nights)</span>
              <span className="font-black text-slate-900">₹12,600</span>
            </div>
          </div>
          <div className="pt-1.5 flex items-center justify-between text-[10px] bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
            <span className="text-slate-600 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" /> WhatsApp Pass Dispatched
            </span>
            <span className="font-bold text-emerald-700">PAID (UPI)</span>
          </div>
        </div>
      ),
    },
    {
      id: 'grid',
      category: 'frontdesk',
      title: 'Visual Operations Board',
      badge: 'Live Room Matrix',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: LayoutGrid,
      iconColor: 'bg-amber-500 text-white shadow-amber-500/20',
      tagline: 'Entire hotel status at a single glance with instant color-coded room tiles.',
      features: ['Ready, Occupied, Dirty & Blocked', 'Drag & Drop Room Shifts', 'Early Check-in Alerts'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-black text-slate-900">Floor 1 & 2 · 32 Rooms</span>
            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
              91% Occupied
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              { num: '101', status: 'Ready', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { num: '102', status: 'Occupied', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
              { num: '103', status: 'Cleaning', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
              { num: '104', status: 'Occupied', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
              { num: '201', status: 'Occupied', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
              { num: '202', status: 'Ready', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { num: '203', status: 'Blocked', bg: 'bg-slate-100 text-slate-600 border-slate-300' },
              { num: '204', status: 'VIP', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
            ].map((room) => (
              <button
                key={room.num}
                onClick={() => setActiveRoomGrid(Number(room.num))}
                className={`p-1 rounded-md border text-[9.5px] font-bold transition cursor-pointer ${room.bg} hover:scale-105`}
              >
                <div>{room.num}</div>
                <div className="text-[8px] font-normal">{room.status}</div>
              </button>
            ))}
          </div>
          <div className="text-[9.5px] text-slate-500 text-center font-medium bg-slate-50 py-1 rounded">
            Click any room for instant folio or check-in
          </div>
        </div>
      ),
    },
    {
      id: 'channels',
      category: 'channels',
      title: '2-Way Channel Manager',
      badge: 'Zero Overbooking',
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
      icon: Radio,
      iconColor: 'bg-sky-600 text-white shadow-sky-500/20',
      tagline: 'Sync rates & availability with MMT, Booking.com, Agoda & Airbnb in < 3s.',
      features: ['Real-Time 2-Way Sync', 'Rate Parity Safeguard', 'Automated Stop-Sell on Full'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">Connected Channels</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> 5 Online
            </span>
          </div>
          <div className="space-y-1.5 text-[10.5px]">
            <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg">
              <span className="font-black text-blue-900">Booking.com</span>
              <span className="text-slate-600 font-semibold">₹3,400 · 3 Left</span>
              <span className="text-[9px] text-emerald-600 font-bold">Synced 12s ago</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg">
              <span className="font-black text-rose-600">MakeMyTrip</span>
              <span className="text-slate-600 font-semibold">₹3,400 · 3 Left</span>
              <span className="text-[9px] text-emerald-600 font-bold">Synced 12s ago</span>
            </div>
            <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg">
              <span className="font-black text-amber-700">Agoda</span>
              <span className="text-slate-600 font-semibold">₹3,400 · 3 Left</span>
              <span className="text-[9px] text-emerald-600 font-bold">Synced 12s ago</span>
            </div>
          </div>
          <div className="text-[9.5px] text-sky-800 bg-sky-50 p-1.5 rounded text-center font-bold">
            Zero Rate Disparity · Multi-Calendar Active
          </div>
        </div>
      ),
    },
    {
      id: 'housekeeping',
      category: 'frontdesk',
      title: 'Smart Housekeeping',
      badge: 'Mobile Optimized',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      icon: Sparkles,
      iconColor: 'bg-teal-600 text-white shadow-teal-500/20',
      tagline: 'Empower cleaning staff with mobile task checklists and instant front desk sync.',
      features: ['Live Dirty/Clean Toggles', 'Staff Inspection Checklist', 'Minibar & Linen Count'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">Cleaning Task #302</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
              In Progress
            </span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800">Deluxe Pool Villa #302</span>
              <span className="text-slate-500 text-[10px]">Staff: Sunita D.</span>
            </div>
            <div className="space-y-1 pt-1 text-[10px] text-slate-600">
              <div className="flex items-center gap-1.5 text-emerald-700">
                <Check className="w-3 h-3 text-emerald-600" /> Linen & Bedding Changed
              </div>
              <div className="flex items-center gap-1.5 text-emerald-700">
                <Check className="w-3 h-3 text-emerald-600" /> Bathroom Sanitized
              </div>
              <div className="flex items-center gap-1.5 text-amber-700">
                <Clock className="w-3 h-3 text-amber-600" /> Restocking Minibar (2 min left)
              </div>
            </div>
          </div>
          <div className="p-1.5 bg-emerald-50 rounded-lg text-center text-[10px] font-bold text-emerald-700">
            Auto-notifies front desk once inspected
          </div>
        </div>
      ),
    },
    {
      id: 'pos',
      category: 'pos',
      title: 'Restaurant & In-Room POS',
      badge: 'Direct Folio Billing',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: UtensilsCrossed,
      iconColor: 'bg-rose-600 text-white shadow-rose-500/20',
      tagline: 'Take dining orders, send KOT to kitchen, and route bills directly to room folios.',
      features: ['Kitchen Order Tickets (KOT)', 'Table & Room Delivery', 'GST Breakdown (5%/18%)'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">KOT #142 · Table 6</span>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
              Sent to Kitchen
            </span>
          </div>
          <div className="space-y-1 text-[11px] text-slate-700">
            <div className="flex justify-between">
              <span>2x Dal Makhani Special</span>
              <span className="font-bold">₹560</span>
            </div>
            <div className="flex justify-between">
              <span>4x Butter Roti / Naan</span>
              <span className="font-bold">₹240</span>
            </div>
            <div className="flex justify-between">
              <span>1x Fresh Lime Soda</span>
              <span className="font-bold">₹90</span>
            </div>
          </div>
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10.5px]">
            <span className="font-bold text-slate-900">Total: ₹890 + GST</span>
            <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded text-[10px]">
              Transfer to Room 204
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'gst',
      category: 'finance',
      title: 'GST Billing & Instant Folios',
      badge: 'SAC 9963 Compliant',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: Wallet,
      iconColor: 'bg-emerald-600 text-white shadow-emerald-500/20',
      tagline: 'Issue B2B & B2C tax invoices in seconds with 1-click WhatsApp PDF sharing.',
      features: ['Indian GST Auto-Calculation', 'Corporate GSTIN Validation', 'Split Folios & Extras'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">Tax Invoice #INV-8821</span>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              GST 12% Validated
            </span>
          </div>
          <div className="space-y-1 text-[10.5px] text-slate-600">
            <div className="flex justify-between">
              <span>Room Charges (3 Nights):</span>
              <span className="font-bold text-slate-900">₹9,000</span>
            </div>
            <div className="flex justify-between">
              <span>Restaurant & Room Service:</span>
              <span className="font-bold text-slate-900">₹1,850</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[10px]">
              <span>CGST (6%) + SGST (6%):</span>
              <span className="font-semibold text-slate-700">₹1,302</span>
            </div>
          </div>
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs font-black">
            <span className="text-slate-900">Grand Total: ₹12,152</span>
            <button className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-200 px-2 py-1 rounded flex items-center gap-1 transition">
              <FileText className="w-3 h-3" /> WhatsApp Bill
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'nightaudit',
      category: 'finance',
      title: 'Automated Night Audit',
      badge: 'Zero Double-Entry',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: Moon,
      iconColor: 'bg-purple-600 text-white shadow-purple-500/20',
      tagline: '1-click day-close reconciles cash, card, and UPI collections with zero ledger errors.',
      features: ['Automated Midnight Roll', 'Cash-Drawer Reconciliation', 'No-Show Charges Posting'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">Night Audit Check · 2:00 AM</span>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
              Automated
            </span>
          </div>
          <div className="space-y-1.5 text-[10.5px]">
            <div className="flex items-center justify-between text-slate-700">
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="w-3 h-3" /> All 14 Departures Cleared
              </span>
              <span className="font-bold text-slate-900">Done</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="w-3 h-3" /> Room Rates & Taxes Posted
              </span>
              <span className="font-bold text-slate-900">₹1,48,500</span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="w-3 h-3" /> Cash in Hand vs Ledger Match
              </span>
              <span className="font-bold text-emerald-600">100% Match</span>
            </div>
          </div>
          <div className="p-1.5 bg-purple-50 rounded-lg text-center text-[10px] font-bold text-purple-700">
            Morning report auto-dispatched to Owner's WhatsApp
          </div>
        </div>
      ),
    },
    {
      id: 'analytics',
      category: 'finance',
      title: 'Executive Analytics & RevPAR',
      badge: 'Real-Time Insights',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: BarChart3,
      iconColor: 'bg-indigo-600 text-white shadow-indigo-500/20',
      tagline: 'Track ADR, RevPAR, channel ROI, and forward occupancy forecasts in real time.',
      features: ['Live RevPAR & ADR Gauges', 'OTA vs Direct Commission Saver', 'Monthly P&L Export'],
      mockup: (
        <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-sm space-y-2 text-left font-sans">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="text-xs font-black text-slate-900">Performance Dashboard</span>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> +32% YoY
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
              <p className="text-[9px] text-slate-500 uppercase font-bold">ADR (Avg Daily Rate)</p>
              <p className="text-xs font-black text-slate-900 mt-0.5">₹4,850</p>
            </div>
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
              <p className="text-[9px] text-slate-500 uppercase font-bold">RevPAR</p>
              <p className="text-xs font-black text-indigo-600 mt-0.5">₹4,365</p>
            </div>
          </div>
          <div className="p-1.5 bg-indigo-50/70 rounded-lg text-center text-[10px] text-indigo-900 font-semibold flex items-center justify-between px-2">
            <span>Direct Revenue Share:</span>
            <span className="font-bold text-indigo-700">68% (Saved ₹42,000 Comm.)</span>
          </div>
        </div>
      ),
    },
  ];

  const filteredModules = selectedCategory === 'all'
    ? MODULES
    : MODULES.filter((m) => m.category === selectedCategory);

  return (
    <section id="modules" className="py-24 sm:py-32 bg-slate-50/50 border-b border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 sm:mb-16 gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/90 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              Complete Hospitality Operating System
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-[1.15]">
              Powerful Modules for <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600">
                Complete Hotel Management.
              </span>
            </h2>
            <p className="text-base sm:text-lg text-slate-600 mt-3 font-normal leading-relaxed">
              Every critical department connected in real-time. Front desk, channel manager, restaurant POS, housekeeping, and finance talking seamlessly without double-entry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onOpenBookDemo}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm shadow-md hover:shadow-lg transition cursor-pointer"
            >
              Book 1-on-1 Demo <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-10 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as CategoryType)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredModules.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 flex flex-col justify-between hover:border-blue-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                <div>
                  {/* Top Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-md ${item.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-[13px] text-slate-600 mt-1.5 leading-relaxed font-normal">
                    {item.tagline}
                  </p>

                  {/* Bullet points */}
                  <div className="mt-3.5 space-y-1.5 border-t border-slate-100 pt-3">
                    {item.features.map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mini Live Mockup */}
                <div className="mt-5 pt-2">
                  {item.mockup}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Banner */}
        <div className="mt-14 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-lg sm:text-xl font-black">
              Need custom room configurations or multi-property setup?
            </h4>
            <p className="text-xs sm:text-sm text-slate-300">
              Our hospitality onboarding experts set up your inventory, rate plans, and taxes in under 24 hours.
            </p>
          </div>
          <button
            onClick={onOpenBookDemo}
            className="px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm shadow-lg whitespace-nowrap cursor-pointer transition transform hover:scale-105"
          >
            Schedule Free Onboarding Call
          </button>
        </div>

      </div>
    </section>
  );
};
