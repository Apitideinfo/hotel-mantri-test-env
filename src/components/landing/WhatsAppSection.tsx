import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, ArrowRight, ShieldCheck, CheckCheck, Sparkles,
  IndianRupee, Bed, TrendingUp, Bell, Zap, QrCode, FileText,
  ArrowUpDown, Check, RefreshCw, Smartphone, Award,
  Wifi, Battery, Signal, Phone, Video, MoreVertical, Paperclip,
  Smile, Mic, Bot
} from 'lucide-react';

interface WhatsAppSectionProps {
  onOpenBookDemo?: () => void;
}

interface ChatMessage {
  id: number;
  sender: 'guest' | 'bot' | 'system';
  text: string;
  time: string;
  badge?: string;
  hasPayBtn?: boolean;
  hasVoucher?: boolean;
}

export const WhatsAppSection: React.FC<WhatsAppSectionProps> = ({ onOpenBookDemo }) => {
  // Mobile screen switcher: for displays under 1024px
  const [activeScreenTab, setActiveScreenTab] = useState<'all' | 'chat' | 'report' | 'celebration'>('all');

  // Left 3 Cards (Perfect balance)
  const REPORT_FEATURES_LEFT = [
    {
      id: 'daily',
      title: 'Daily Hotel Report',
      desc: 'Complete snapshot delivered every evening at your chosen time with room status and day summary.',
      icon: FileText,
      badgeText: 'Daily Report',
      badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      status: '8:00 PM Daily Dispatch',
      statusColor: 'text-blue-400',
    },
    {
      id: 'occupancy',
      title: 'Occupancy Report',
      desc: 'Real-time room occupancy and upcoming week forecast so you always know availability in advance.',
      icon: Bed,
      badgeText: 'Live Occupancy',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      status: 'Continuous 24/7 Radar',
      statusColor: 'text-emerald-400',
    },
    {
      id: 'arrivals',
      title: 'Arrivals & Departures',
      desc: 'Know VIP arrivals, pending check-ins and today checkouts before staff starts their shift.',
      icon: ArrowUpDown,
      badgeText: 'Front-Desk Sync',
      badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      status: 'Live Shift Handover',
      statusColor: 'text-purple-400',
    },
  ];

  // Right 3 Cards (Perfect balance)
  const REPORT_FEATURES_RIGHT = [
    {
      id: 'revenue',
      title: 'Revenue Report',
      desc: 'Day closing totals, cash, card and UPI collection breakdown automatically audited without errors.',
      icon: IndianRupee,
      badgeText: 'Financial Audit',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      status: '100% Zero Discrepancy',
      statusColor: 'text-emerald-400',
    },
    {
      id: 'alerts',
      title: 'Custom Alerts',
      desc: 'Instant notifications on high-value bookings or cancellations sent directly to owner’s WhatsApp.',
      icon: Bell,
      badgeText: 'Instant Alerts',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      status: 'Instant Pocket Push',
      statusColor: 'text-rose-400',
    },
    {
      id: 'bot_direct',
      title: 'Direct AI Booking Bot',
      desc: 'Automates guest room enquiries and accepts prepaid UPI bookings 24/7 with zero OTA commission.',
      icon: Bot,
      badgeText: 'Direct Profit',
      badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
      status: '0% OTA Commission',
      statusColor: 'text-cyan-400',
    },
  ];

  // Chat conversation messages
  const CHAT_SEQUENCE: ChatMessage[] = [
    {
      id: 1,
      sender: 'guest',
      text: 'Hi! Do you have a Deluxe room for this weekend (25-27 Oct) for 2 guests?',
      time: '9:40 AM',
    },
    {
      id: 2,
      sender: 'bot',
      text: 'Namaste Rahul ji! 🙏 Deluxe Heritage Suite is available at ₹4,200/night incl. Gourmet Breakfast & Wi-Fi.',
      badge: '✨ Best Direct Rate Guaranteed · Free High Tea ☕',
      time: '9:40 AM',
    },
    {
      id: 3,
      sender: 'guest',
      text: 'Sounds great! Please reserve it for Rahul Sharma.',
      time: '9:41 AM',
    },
    {
      id: 4,
      sender: 'bot',
      text: '🔒 Reservation #HM-8921 created for 2 Nights (25-27 Oct). Total: ₹8,400. Tap below to pay via UPI and lock your booking instantly:',
      hasPayBtn: true,
      time: '9:41 AM',
    },
    {
      id: 5,
      sender: 'system',
      text: 'UPI Payment Successful: ₹8,400 Received ✅ (Txn #UPI-849204)',
      time: '9:41 AM',
    },
    {
      id: 6,
      sender: 'bot',
      text: '🎉 Booking Confirmed! Room 204 is locked in your name. Check-in QR pass dispatched below. Welcome to Grand Heritage! ✨',
      hasVoucher: true,
      time: '9:42 AM',
    },
    {
      id: 7,
      sender: 'guest',
      text: 'Thank you! That was completely seamless.',
      time: '9:42 AM',
    },
  ];

  const [visibleMessages, setVisibleMessages] = useState<number>(3);
  const [isBotTyping, setIsBotTyping] = useState<boolean>(false);

  // ONLY scroll the inner chat div. NEVER call scrollIntoView to avoid jumping the main page!
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const executeAutoScroll = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  // Auto-scroll inside phone only
  useEffect(() => {
    executeAutoScroll();
  }, [visibleMessages, isBotTyping]);

  // Automated conversation loop
  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleMessages((current) => {
        if (current >= CHAT_SEQUENCE.length) {
          // Pause at the end, then loop
          return 2;
        }
        return current + 1;
      });
    }, 4200);

    return () => clearInterval(timer);
  }, [CHAT_SEQUENCE.length]);

  const handleReplayChat = () => {
    setVisibleMessages(1);
    setIsBotTyping(true);
    setTimeout(() => {
      setIsBotTyping(false);
      setVisibleMessages(2);
      executeAutoScroll();
    }, 900);
  };

  const handleOpenWhatsAppChat = () => {
    const text = encodeURIComponent('Hi HotelMantri Team, I want to see a live demo of the WhatsApp AI Booking Bot & Daily Hotel Reports.');
    window.open(`https://wa.me/919925958831?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section id="whatsapp" className="relative py-24 sm:py-32 bg-[#030712] text-white overflow-hidden border-b border-slate-800">
      
      {/* Ambient Neon Lighting Backdrop matching Reference Image */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[550px] bg-emerald-500/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute top-20 right-10 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #10b981 1px, transparent 0)`,
          backgroundSize: '36px 36px',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* ========================================================= */}
        {/* TOP HEADER */}
        {/* ========================================================= */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4 shadow-[0_0_25px_rgba(16,185,129,0.25)]">
            <MessageSquare className="w-4 h-4 fill-emerald-400 text-emerald-400" />
            WhatsApp Automation & AI Booking Engine
          </div>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
            Your Hotel Updates. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-green-400">
              Delivered on WhatsApp.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-slate-400 mt-4 font-normal leading-relaxed">
            Get daily reports, occupancy, revenue, arrivals and important updates directly on WhatsApp without opening any app. Plus, take commission-free direct bookings 24/7 with our AI concierge.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
            <button
              onClick={handleOpenWhatsAppChat}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm shadow-[0_0_35px_rgba(16,185,129,0.4)] hover:shadow-[0_0_45px_rgba(16,185,129,0.6)] transition-all cursor-pointer transform hover:-translate-y-0.5"
            >
              <MessageSquare className="w-4 h-4 fill-slate-950" /> Test Live WhatsApp Bot <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenBookDemo}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700/80 hover:border-slate-600 transition cursor-pointer"
            >
              Book 1-on-1 Demo
            </button>
          </div>
        </div>

        {/* Mobile View Switcher Tabs (For Small Screens < 1024px) */}
        <div className="lg:hidden flex items-center justify-center gap-2 mb-8 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveScreenTab('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
              activeScreenTab === 'all'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            All 3 Screens
          </button>
          <button
            onClick={() => setActiveScreenTab('chat')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
              activeScreenTab === 'chat'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Center: Live AI Bot
          </button>
          <button
            onClick={() => setActiveScreenTab('report')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
              activeScreenTab === 'report'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Left: Daily Report
          </button>
          <button
            onClick={() => setActiveScreenTab('celebration')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
              activeScreenTab === 'celebration'
                ? 'bg-emerald-500 text-slate-950 font-black'
                : 'bg-slate-900 text-slate-400 border border-slate-800'
            }`}
          >
            Right: Celebration
          </button>
        </div>

        {/* ========================================================================= */}
        {/* BALANCED 3D SHOWCASE: 3 CARDS LEFT + 3 PHONES CENTER + 3 CARDS RIGHT */}
        {/* ========================================================================= */}
        <div className="relative">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-6 items-center">
            
            {/* ------------------------------------------------------------- */}
            {/* LEFT COLUMN (3 CARDS): Daily Hotel Report, Occupancy, Arrivals */}
            {/* ------------------------------------------------------------- */}
            <div className="lg:col-span-3 space-y-4 order-2 lg:order-1">
              {REPORT_FEATURES_LEFT.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.id}
                    className="group relative bg-slate-900/75 backdrop-blur-xl border border-slate-800/90 hover:border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${card.badgeColor}`}>
                        <Icon className="w-3.5 h-3.5" /> {card.badgeText}
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <h4 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition">
                      {card.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {card.desc}
                    </p>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Status</span>
                      <span className={`font-bold flex items-center gap-1.5 ${card.statusColor}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {card.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ------------------------------------------------------------- */}
            {/* CENTER STAGE (6 COLS): 3 TALL, ULTRA-REALISTIC SMARTPHONES */}
            {/* ------------------------------------------------------------- */}
            <div className="lg:col-span-6 order-1 lg:order-2 flex items-center justify-center relative py-4">
              
              <div className="relative w-full max-w-[620px] flex items-center justify-center">

                {/* ========================================================= */}
                {/* 1. LEFT PHONE: DAILY HOTEL REPORT (Perspective Tilted Left) */}
                {/* ========================================================= */}
                <div
                  className={`transition-all duration-300 ${
                    activeScreenTab === 'chat' || activeScreenTab === 'celebration'
                      ? 'hidden'
                      : activeScreenTab === 'report'
                      ? 'block w-full max-w-[320px] z-30 scale-105'
                      : 'hidden sm:block absolute -left-2 md:-left-6 top-1/2 -translate-y-1/2 w-[230px] md:w-[250px] h-[540px] z-10 -rotate-6 transform scale-95 opacity-90 hover:opacity-100 hover:rotate-0 hover:scale-100 hover:z-30 transition-all duration-300'
                  }`}
                >
                  {/* Smartphone Chassis */}
                  <div className="relative w-full h-full bg-slate-950 p-2.5 rounded-[48px] shadow-[0_25px_60px_rgba(0,0,0,0.85)] border-[4px] border-slate-700/80 ring-1 ring-slate-600/50 flex flex-col justify-between">
                    
                    {/* Hardware Buttons */}
                    <div className="absolute -left-[6px] top-24 w-[3px] h-9 bg-slate-700 rounded-l" />
                    <div className="absolute -left-[6px] top-36 w-[3px] h-9 bg-slate-700 rounded-l" />
                    <div className="absolute -right-[6px] top-28 w-[3px] h-12 bg-slate-700 rounded-r" />

                    {/* Top Dynamic Island */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-3.5 bg-black rounded-full z-30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-700 mr-1.5" />
                      <div className="w-6 h-1 rounded-full bg-slate-800" />
                    </div>

                    {/* Inner Screen */}
                    <div className="w-full h-full bg-[#0b1320] rounded-[40px] overflow-hidden text-left border border-slate-800 text-slate-100 font-sans shadow-inner pt-6 pb-2.5 flex flex-col justify-between">
                      
                      {/* Status Bar */}
                      <div>
                        <div className="px-4 pb-1.5 flex items-center justify-between text-[10px] text-slate-300 font-semibold border-b border-slate-800/80">
                          <span>9:41</span>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Signal className="w-2.5 h-2.5" />
                            <span className="text-[8px] font-bold">5G</span>
                            <Battery className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                        </div>

                        {/* App Header */}
                        <div className="bg-slate-900 px-3.5 py-2 flex items-center justify-between border-b border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">
                              HM
                            </div>
                            <div>
                              <p className="text-[10.5px] font-bold text-white leading-tight">Daily Hotel Report</p>
                              <span className="text-[8px] text-emerald-400">8:00 PM Delivery · Auto</span>
                            </div>
                          </div>
                          <span className="text-[8.5px] font-mono text-slate-400">Dwarka</span>
                        </div>
                      </div>

                      {/* Report Body */}
                      <div className="p-3 space-y-2 text-[10px] overflow-hidden flex-1 flex flex-col justify-around">
                        
                        {/* 1. Occupancy Widget */}
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 font-bold text-[8.5px] uppercase tracking-wider flex items-center gap-1">
                              <Bed className="w-3 h-3 text-amber-400" /> Occupancy Report
                            </span>
                            <span className="text-emerald-400 font-black text-xs">94%</span>
                          </div>
                          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 h-full w-[94%]" />
                          </div>
                          <div className="flex justify-between text-[8px] text-slate-400">
                            <span>38 of 40 Rooms Booked</span>
                            <span className="text-amber-300 font-semibold">2 Vacant</span>
                          </div>
                        </div>

                        {/* 2. Revenue Widget */}
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-400 font-bold text-[8.5px] uppercase flex items-center gap-1">
                              <IndianRupee className="w-3 h-3 text-emerald-400" /> Revenue Report
                            </span>
                            <span className="text-emerald-400 text-[8px] font-bold">+24% vs LY</span>
                          </div>
                          <p className="text-base font-black text-amber-400 mt-0.5">₹1,84,500</p>
                          <div className="grid grid-cols-3 gap-1 mt-1 text-[7.5px] text-slate-300 pt-1.5 border-t border-slate-700/50">
                            <div>UPI: ₹1.12L</div>
                            <div>Cash: ₹45K</div>
                            <div>Card: ₹27K</div>
                          </div>
                        </div>

                        {/* 3. Arrivals & Departures */}
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 space-y-1">
                          <span className="text-slate-400 font-bold text-[8.5px] uppercase flex items-center gap-1">
                            <ArrowUpDown className="w-3 h-3 text-purple-400" /> Arrivals & Departures
                          </span>
                          <div className="flex justify-between text-slate-300 text-[8.5px]">
                            <span>Today Arrivals:</span>
                            <span className="font-bold text-emerald-400">14 (12 Checked)</span>
                          </div>
                          <div className="flex justify-between text-slate-300 text-[8.5px]">
                            <span>Departures:</span>
                            <span className="font-bold text-slate-200">8 Cleared</span>
                          </div>
                        </div>

                        {/* 4. Custom Alert Banner */}
                        <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[8.5px] text-rose-300 flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Bell className="w-3.5 h-3.5 text-rose-400 shrink-0" /> Alert: VIP Booking ₹36,000
                          </span>
                          <span className="text-slate-400">8:00 PM</span>
                        </div>

                      </div>

                      {/* Bottom indicator */}
                      <div className="px-3 text-center">
                        <span className="text-[8px] text-slate-500">Official Hotel Digest · Reconciled</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 2. CENTER PHONE: LIVE WHATSAPP AI BOT WITH AUTO-SCROLL */}
                {/* ========================================================= */}
                <div
                  className={`transition-all duration-300 ${
                    activeScreenTab === 'report' || activeScreenTab === 'celebration'
                      ? 'hidden'
                      : 'relative w-[295px] sm:w-[320px] md:w-[330px] h-[610px] z-20 transform scale-100 sm:scale-105'
                  }`}
                >
                  {/* Neon Glow behind Center Phone */}
                  <div className="absolute inset-0 bg-emerald-500/30 rounded-[54px] blur-3xl -z-10 animate-pulse" />

                  {/* Smartphone Chassis */}
                  <div className="relative w-full h-full bg-slate-950 p-2.5 rounded-[50px] shadow-[0_0_80px_rgba(16,185,129,0.38)] border-[4px] border-emerald-500/80 ring-1 ring-emerald-400/50 flex flex-col justify-between">
                    
                    {/* Hardware Buttons on side */}
                    <div className="absolute -left-[6px] top-28 w-[3px] h-10 bg-slate-700 rounded-l" />
                    <div className="absolute -left-[6px] top-42 w-[3px] h-10 bg-slate-700 rounded-l" />
                    <div className="absolute -right-[6px] top-32 w-[3px] h-14 bg-slate-700 rounded-r" />

                    {/* Top Dynamic Island Pill */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-30 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-700 mr-2 flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-blue-900/60" />
                      </div>
                      <div className="w-8 h-1.5 rounded-full bg-slate-800" />
                    </div>

                    {/* Inner Screen */}
                    <div className="w-full h-full bg-[#0b141a] rounded-[42px] overflow-hidden pt-6 pb-2 text-left border border-slate-800 shadow-inner flex flex-col justify-between">
                      
                      {/* iOS Status Bar */}
                      <div>
                        <div className="px-4 pb-1.5 flex items-center justify-between text-[10px] text-slate-300 font-semibold border-b border-slate-800/80">
                          <span>9:41</span>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Signal className="w-3 h-3" />
                            <Wifi className="w-3 h-3" />
                            <Battery className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                        </div>

                        {/* WhatsApp Top Header Bar */}
                        <div className="bg-[#1f2c34] text-white px-3.5 py-2 flex items-center justify-between border-b border-slate-800 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-xs border border-emerald-300">
                                HM
                              </div>
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#1f2c34]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1 font-bold text-xs text-white">
                                HotelMantri Bot <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                              </div>
                              <span className="text-[9px] text-emerald-400 flex items-center gap-1">
                                Online · 24/7 AI Receptionist
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 text-slate-300">
                            <Phone className="w-3.5 h-3.5 text-slate-300" />
                            <Video className="w-3.5 h-3.5 text-slate-300" />
                            <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </div>
                      </div>

                      {/* ==================================================== */}
                      {/* TALL CHAT SCROLL AREA (ONLY THIS DIV SCROLLS!) */}
                      {/* ==================================================== */}
                      <div
                        ref={chatScrollRef}
                        className="p-3 space-y-2.5 text-[11px] font-sans flex-1 overflow-y-auto scroll-smooth sidebar-scroll"
                        style={{ maxHeight: '390px' }}
                      >
                        {/* Date Indicator */}
                        <div className="text-center my-1">
                          <span className="bg-[#182229] text-slate-400 text-[9px] font-medium px-2 py-0.5 rounded shadow-2xs">
                            Today · Instant Direct Booking
                          </span>
                        </div>

                        {/* Streamed Messages */}
                        {CHAT_SEQUENCE.slice(0, visibleMessages).map((msg) => {
                          if (msg.sender === 'guest') {
                            return (
                              <div key={msg.id} className="flex justify-end animate-fadeIn">
                                <div className="bg-[#005c4b] text-white rounded-2xl rounded-tr-none px-3 py-2 max-w-[85%] shadow-xs space-y-0.5">
                                  <p className="leading-snug">{msg.text}</p>
                                  <div className="flex justify-end items-center gap-1 text-[8px] text-emerald-200">
                                    <span>{msg.time}</span>
                                    <CheckCheck className="w-3 h-3 text-sky-400" />
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          if (msg.sender === 'system') {
                            return (
                              <div key={msg.id} className="flex justify-center animate-fadeIn my-1">
                                <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold px-3 py-1.5 rounded-xl shadow-xs text-center flex items-center gap-1.5">
                                  <span>💳</span>
                                  <span>{msg.text}</span>
                                </div>
                              </div>
                            );
                          }

                          // Bot Message
                          return (
                            <div key={msg.id} className="flex justify-start animate-fadeIn">
                              <div className="bg-[#202c33] text-slate-100 rounded-2xl rounded-tl-none p-2.5 max-w-[92%] shadow-xs space-y-1.5 border border-slate-700/50">
                                <div className="flex items-center gap-1 text-emerald-400 font-bold text-[10px]">
                                  <Sparkles className="w-3 h-3" /> 🏨 The Grand Heritage
                                </div>
                                <p className="leading-snug text-slate-200 text-[10.5px]">
                                  {msg.text}
                                </p>
                                
                                {msg.badge && (
                                  <div className="bg-[#111b21] p-1.5 rounded-lg border border-slate-700/60 text-[9px] text-emerald-400 font-bold">
                                    {msg.badge}
                                  </div>
                                )}

                                {msg.hasPayBtn && (
                                  <button className="w-full py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md hover:brightness-110 transition cursor-pointer">
                                    <IndianRupee className="w-3 h-3" /> Pay ₹8,400 via UPI (1-Tap)
                                  </button>
                                )}

                                {msg.hasVoucher && (
                                  <div className="bg-[#111b21] p-1.5 rounded-lg border border-emerald-500/30 text-[9px] text-slate-300 flex items-center justify-between">
                                    <span>Voucher #HM-8921 · Room 204</span>
                                    <span className="text-emerald-400 font-bold">QR Pass Sent</span>
                                  </div>
                                )}

                                <div className="flex justify-end items-center gap-1 text-[8px] text-slate-400">
                                  <span>{msg.time}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Bot typing simulation */}
                        {isBotTyping && (
                          <div className="flex justify-start animate-fadeIn">
                            <div className="bg-[#202c33] rounded-2xl rounded-tl-none px-3 py-2 border border-slate-700/50 flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400">HotelMantri AI is typing</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce delay-150" />
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce delay-300" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* WhatsApp Bottom Input Field */}
                      <div className="px-3 pt-1.5 pb-1 border-t border-slate-800 flex items-center gap-2 text-slate-400">
                        <div className="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5 text-[10.5px] text-slate-300 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Smile className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-400">Message...</span>
                          </div>
                          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs shadow-md">
                          <Mic className="w-3.5 h-3.5" />
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Replay Auto-Chat pill */}
                  <div className="mt-3 flex items-center justify-center gap-2 text-[11px]">
                    <button
                      onClick={handleReplayChat}
                      className="px-3.5 py-1 rounded-full bg-slate-900 border border-slate-700 hover:border-emerald-500 text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer shadow-md"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-400" /> Replay Live Chat
                    </button>
                    <span className="text-slate-500">·</span>
                    <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Auto-Scroll Active
                    </span>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* 3. RIGHT PHONE: BOOKING CONFIRMED CELEBRATION (Tilted) */}
                {/* ========================================================= */}
                <div
                  className={`transition-all duration-300 ${
                    activeScreenTab === 'chat' || activeScreenTab === 'report'
                      ? 'hidden'
                      : activeScreenTab === 'celebration'
                      ? 'block w-full max-w-[320px] z-30 scale-105'
                      : 'hidden sm:block absolute -right-2 md:-right-6 top-1/2 -translate-y-1/2 w-[230px] md:w-[250px] h-[540px] z-10 rotate-6 transform scale-95 opacity-90 hover:opacity-100 hover:rotate-0 hover:scale-100 hover:z-30 transition-all duration-300'
                  }`}
                >
                  {/* Smartphone Chassis */}
                  <div className="relative w-full h-full bg-slate-950 p-2.5 rounded-[48px] shadow-[0_25px_60px_rgba(0,0,0,0.85)] border-[4px] border-slate-700/80 ring-1 ring-slate-600/50 flex flex-col justify-between">
                    
                    {/* Hardware Buttons */}
                    <div className="absolute -left-[6px] top-24 w-[3px] h-9 bg-slate-700 rounded-l" />
                    <div className="absolute -left-[6px] top-36 w-[3px] h-9 bg-slate-700 rounded-l" />
                    <div className="absolute -right-[6px] top-28 w-[3px] h-12 bg-slate-700 rounded-r" />

                    {/* Top Dynamic Island */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-3.5 bg-black rounded-full z-30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-700 mr-1.5" />
                      <div className="w-6 h-1 rounded-full bg-slate-800" />
                    </div>

                    {/* Inner Screen */}
                    <div className="w-full h-full bg-[#0b141a] rounded-[40px] overflow-hidden text-left border border-slate-800 text-slate-100 font-sans shadow-inner pt-6 pb-2.5 flex flex-col justify-between">
                      
                      {/* iOS Status Bar */}
                      <div>
                        <div className="px-4 pb-1.5 flex items-center justify-between text-[10px] text-slate-300 font-semibold border-b border-slate-800/80">
                          <span>9:41</span>
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Signal className="w-2.5 h-2.5" />
                            <span className="text-[8px] font-bold">5G</span>
                            <Battery className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                        </div>

                        {/* Celebration Banner */}
                        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white px-3 py-2 text-center shadow-md">
                          <span className="text-base animate-bounce block">🎉</span>
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-white">
                            BOOKING CONFIRMED!
                          </h4>
                          <p className="text-[7.5px] text-emerald-100 font-medium">
                            The Grand Heritage Resort
                          </p>
                        </div>
                      </div>

                      {/* Voucher Body */}
                      <div className="p-3 space-y-2 text-[10px] flex-1 flex flex-col justify-around">
                        
                        {/* Guest & Voucher Pill */}
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 space-y-0.5">
                          <div className="flex justify-between items-center">
                            <span className="text-amber-400 font-bold text-[8.5px]">VOUCHER #HM-8921</span>
                            <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-bold">100% PAID</span>
                          </div>
                          <p className="font-black text-white text-[11px]">Rahul Sharma</p>
                          <p className="text-[8.5px] text-slate-400">Royal Heritage Suite · Room 204</p>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-800/80 p-2 rounded-xl border border-slate-700/60 text-[8.5px]">
                          <div>
                            <span className="text-slate-400 block text-[7px]">CHECK-IN</span>
                            <span className="font-bold text-white">25 Oct, 2:00 PM</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[7px]">CHECK-OUT</span>
                            <span className="font-bold text-white">27 Oct, 11:00 AM</span>
                          </div>
                        </div>

                        {/* QR Pass */}
                        <div className="bg-white p-2.5 rounded-xl text-center text-slate-900 space-y-1 shadow-sm">
                          <div className="w-16 h-16 mx-auto bg-slate-100 border border-slate-300 rounded-lg flex items-center justify-center p-1">
                            <QrCode className="w-14 h-14 text-slate-900" />
                          </div>
                          <p className="text-[9px] font-black text-slate-900 leading-tight">
                            Express Mobile Key QR
                          </p>
                          <p className="text-[7.5px] text-slate-500">
                            Scan at reception for 45-sec check-in
                          </p>
                        </div>

                        {/* Status */}
                        <div className="flex items-center justify-between text-[8px] text-slate-400 pt-0.5">
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Dispatched on WhatsApp
                          </span>
                          <span>9:41 AM</span>
                        </div>

                      </div>

                      {/* Bottom Footer */}
                      <div className="px-3 text-center">
                        <span className="text-[8px] text-slate-500">Auto Contactless Pass Generated</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* ------------------------------------------------------------- */}
            {/* RIGHT COLUMN (3 CARDS): Revenue Report, Alerts, Direct AI Bot */}
            {/* ------------------------------------------------------------- */}
            <div className="lg:col-span-3 space-y-4 order-3">
              {REPORT_FEATURES_RIGHT.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.id}
                    className="group relative bg-slate-900/75 backdrop-blur-xl border border-slate-800/90 hover:border-emerald-500/50 rounded-2xl p-4 sm:p-5 shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${card.badgeColor}`}>
                        <Icon className="w-3.5 h-3.5" /> {card.badgeText}
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <h4 className="text-base font-extrabold text-white group-hover:text-emerald-400 transition">
                      {card.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {card.desc}
                    </p>
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Duty Sync</span>
                      <span className={`font-bold flex items-center gap-1.5 ${card.statusColor}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {card.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

        </div>

        {/* Bottom Feature Badges Strip */}
        <div className="mt-16 sm:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto text-center">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <p className="text-2xl font-black text-white">0%</p>
            <p className="text-xs text-slate-400 mt-0.5">OTA Commission on Direct Chat</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <p className="text-2xl font-black text-emerald-400">&lt; 3s</p>
            <p className="text-xs text-slate-400 mt-0.5">Average AI Response Time</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <p className="text-2xl font-black text-amber-400">8:00 PM</p>
            <p className="text-xs text-slate-400 mt-0.5">Automated Daily Owner Digest</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
            <p className="text-2xl font-black text-teal-300">100%</p>
            <p className="text-xs text-slate-400 mt-0.5">Mobile Contactless Check-In</p>
          </div>
        </div>

      </div>
    </section>
  );
};
