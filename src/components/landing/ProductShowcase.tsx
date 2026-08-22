import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, Bed, MessageSquare, Users, CheckCircle2, ArrowUpRight, Activity } from 'lucide-react';

interface MousePos {
  x: number;
  y: number;
}

export const ProductShowcase: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dashMouse, setDashMouse] = useState<MousePos | null>(null);
  const [activeRoomPulse, setActiveRoomPulse] = useState<number | null>(null);

  // Intersection Observer for scroll entrance
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.12 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Periodic room status live pulse effect
  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      const roomIds = [101, 102, 103, 104, 105, 201, 202, 203, 204, 205];
      const randomRoom = roomIds[Math.floor(Math.random() * roomIds.length)];
      setActiveRoomPulse(randomRoom);
      setTimeout(() => setActiveRoomPulse(null), 1200);
    }, 4500);
    return () => clearInterval(interval);
  }, [isVisible]);

  // Dashboard Mouse Position Tracker
  const handleDashMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDashMouse({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Animated Counter values
  const useCounter = (target: number, duration: number = 1400) => {
    const [val, setVal] = useState(0);
    useEffect(() => {
      if (!isVisible) return;
      let startTime: number | null = null;
      const animate = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setVal(Math.floor(eased * target));
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setVal(target);
        }
      };
      requestAnimationFrame(animate);
    }, [target, duration]);
    return val;
  };

  const revenueVal = useCounter(248500, 1600);
  const occupancyVal = useCounter(72, 1400);
  const bookingsVal = useCounter(18, 1200);
  const staffVal = useCounter(6, 1000);

  const roomsData = [
    { number: 101, status: 'Occupied' },
    { number: 102, status: 'Occupied' },
    { number: 103, status: 'Vacant' },
    { number: 104, status: 'Occupied' },
    { number: 105, status: 'Occupied' },
    { number: 201, status: 'Vacant' },
    { number: 202, status: 'Occupied' },
    { number: 203, status: 'Occupied' },
    { number: 204, status: 'Occupied' },
    { number: 205, status: 'Vacant' },
  ];

  return (
    <section
      id="product"
      ref={sectionRef}
      className="py-24 lg:py-32 bg-[#06152F] relative overflow-hidden select-none border-t border-white/5"
    >
      {/* Background Lighting & Radial Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-cyan-500/10 rounded-full blur-[180px]" />
        <div className="absolute bottom-10 right-1/3 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2.5 bg-slate-900/90 border border-cyan-400/30 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-widest text-cyan-300 shadow-xl transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>PRODUCT SHOWCASE</span>
          </div>

          {/* Heading */}
          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mt-6 mb-6 transition-all duration-700 ease-out delay-100 ${
              isVisible
                ? 'opacity-100 translate-y-0 blur-0'
                : 'opacity-0 translate-y-6 blur-sm'
            }`}
          >
            Designed for{' '}
            <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              speed, clarity, and control
            </span>
          </h2>

          {/* Description */}
          <p
            className={`text-slate-300/90 text-base sm:text-lg leading-relaxed font-normal max-w-2xl mx-auto transition-all duration-700 ease-out delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            Experience an intuitive interface that streamlines operations from day one.
          </p>
        </div>

        {/* Floating 3D Product Dashboard Frame */}
        <div
          ref={dashboardRef}
          onMouseMove={handleDashMouseMove}
          onMouseLeave={() => setDashMouse(null)}
          className={`relative rounded-[28px] overflow-hidden bg-slate-950/90 border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.85)] p-4 sm:p-7 lg:p-8 transition-all duration-900 ease-out ${
            isVisible
              ? 'opacity-100 translate-y-0 scale-100 blur-0 animate-[float_8s_easeInOut_infinite]'
              : 'opacity-0 translate-y-12 scale-[0.97] blur-md'
          }`}
        >
          {/* Spotlight Cursor Follower */}
          {dashMouse && (
            <div
              className="pointer-events-none absolute -inset-px transition-opacity duration-300 opacity-100 z-0"
              style={{
                background: `radial-gradient(600px circle at ${dashMouse.x}px ${dashMouse.y}px, rgba(34, 211, 238, 0.08), transparent 80%)`,
              }}
            />
          )}

          {/* Ambient Glow behind frame */}
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-600/20 to-indigo-600/20 blur-xl opacity-50 pointer-events-none" />

          {/* Top Browser / App Navigation Bar */}
          <div className="relative z-10 flex items-center justify-between pb-4 mb-6 border-b border-white/10 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/90 shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/90 shadow-sm" />
              <span className="ml-3 font-mono text-[11px] text-slate-300 bg-slate-900/80 px-3 py-1 rounded-lg border border-white/10 shadow-inner">
                app.hotelmantri.com/dashboard
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 text-[11px] font-bold px-3 py-1 rounded-full border border-emerald-500/25 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                System Active
              </span>
            </div>
          </div>

          {/* 4 KPI Metric Cards */}
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
            {/* KPI 1: Revenue */}
            <div className="group bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-cyan-500/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
                <TrendingUp className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight group-hover:text-cyan-200 transition-colors">
                  ₹{revenueVal.toLocaleString('en-IN')}
                </span>
                <span className={`inline-flex items-center gap-0.5 text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/20 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                  ↑ 12.5%
                </span>
              </div>
            </div>

            {/* KPI 2: Occupancy Rate */}
            <div className="group bg-slate-900/80 border border-white/10 hover:border-blue-500/40 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-blue-500/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Occupancy Rate</p>
                <Bed className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight group-hover:text-blue-200 transition-colors">
                  {occupancyVal}%
                </span>
                <span className={`text-xs font-semibold text-cyan-400 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                  18 / 25 Rooms
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full mt-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: isVisible ? '72%' : '0%' }}
                />
              </div>
            </div>

            {/* KPI 3: Active Bookings */}
            <div className="group bg-slate-900/80 border border-white/10 hover:border-emerald-500/40 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-emerald-500/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Bookings</p>
                <MessageSquare className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight group-hover:text-emerald-200 transition-colors">
                  {bookingsVal}
                </span>
                <span className={`inline-flex items-center text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/20 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                  + 20%
                </span>
              </div>
            </div>

            {/* KPI 4: Staff On Duty */}
            <div className="group bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-indigo-500/10">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff On Duty</p>
                <Users className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline justify-between mt-3">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight group-hover:text-indigo-200 transition-colors">
                  {staffVal}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                </span>
              </div>
            </div>
          </div>

          {/* Main Dashboard Interactive Grid: Live Room Occupancy + Recent Operations */}
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Live Room Occupancy Chart Matrix */}
            <div className="lg:col-span-2 bg-slate-900/70 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-inner">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center text-cyan-400">
                    <Bed className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white tracking-tight">Live Room Occupancy Chart</h4>
                    <p className="text-xs text-slate-400">Real-time room allocation status</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 px-3 py-1 rounded-full">
                  Today
                </span>
              </div>

              {/* 10 Rooms Grid Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {roomsData.map((rm, idx) => {
                  const isOcc = rm.status === 'Occupied';
                  const isPulsing = activeRoomPulse === rm.number;

                  return (
                    <div
                      key={rm.number}
                      style={{
                        transitionDelay: isVisible ? `${idx * 80}ms` : '0ms',
                      }}
                      className={`relative p-3.5 rounded-xl border text-center transition-all duration-500 transform hover:-translate-y-1 cursor-pointer ${
                        isOcc
                          ? 'bg-blue-600/15 border-blue-500/35 hover:border-blue-400 hover:shadow-blue-500/20'
                          : 'bg-emerald-600/15 border-emerald-500/35 hover:border-emerald-400 hover:shadow-emerald-500/20'
                      } ${
                        isPulsing ? 'ring-2 ring-cyan-400 scale-105 shadow-lg' : ''
                      } ${
                        isVisible
                          ? 'opacity-100 translate-y-0 scale-100'
                          : 'opacity-0 translate-y-4 scale-95'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-extrabold text-white">{rm.number}</span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOcc ? 'bg-blue-400' : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-[10px] uppercase font-extrabold tracking-wider ${
                          isOcc ? 'text-blue-300' : 'text-emerald-300'
                        }`}
                      >
                        {rm.status}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Col: Recent Operations Live Stream */}
            <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-inner flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-400/25 flex items-center justify-center text-blue-400">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white tracking-tight">Recent Operations</h4>
                      <p className="text-xs text-slate-400">Live operational telemetry</p>
                    </div>
                  </div>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Item 1 */}
                  <div
                    style={{ transitionDelay: isVisible ? '120ms' : '0ms' }}
                    className={`flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-white/10 hover:border-emerald-500/40 transition-all duration-500 ${
                      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-slate-200 font-semibold text-xs">WhatsApp Bill Sent (#102)</p>
                        <p className="text-[10px] text-slate-400">Digital Folio Dispatched</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      2m ago
                    </span>
                  </div>

                  {/* Item 2 */}
                  <div
                    style={{ transitionDelay: isVisible ? '240ms' : '0ms' }}
                    className={`flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-white/10 hover:border-blue-500/40 transition-all duration-500 ${
                      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-slate-200 font-semibold text-xs">Check-in Completed (Room 204)</p>
                        <p className="text-[10px] text-slate-400">Guest Verified & Key Issued</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      12m ago
                    </span>
                  </div>

                  {/* Item 3 */}
                  <div
                    style={{ transitionDelay: isVisible ? '360ms' : '0ms' }}
                    className={`flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-white/10 hover:border-cyan-500/40 transition-all duration-500 ${
                      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                        <Bed className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-slate-200 font-semibold text-xs">Housekeeping Marked Clean (#105)</p>
                        <p className="text-[10px] text-slate-400">Ready for Immediate Allocation</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      25m ago
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Telemetry Footer */}
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Syncing Active
                </span>
                <span className="text-cyan-400 font-semibold">100% Real-time</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

