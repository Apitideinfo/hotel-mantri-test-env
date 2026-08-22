import React, { useEffect, useRef, useState } from 'react';
import { Bed, CalendarCheck, IndianRupee, BarChart3, MessageSquare, Users, UserCheck, TrendingUp, ArrowRight } from 'lucide-react';

interface CardMousePosition {
  x: number;
  y: number;
}

export const FeaturesSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePositions, setMousePositions] = useState<Record<number, CardMousePosition>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePositions((prev) => ({ ...prev, [index]: { x, y } }));
  };

  const features = [
    {
      id: 'room-mgmt',
      icon: Bed,
      iconAnim: 'group-hover:translate-x-1',
      title: 'Room Management',
      description: 'Manage room availability, occupancy, housekeeping status, and instant room allocation from one intuitive grid.',
      accentColor: 'from-cyan-500/15 via-cyan-500/5 to-transparent',
      borderColor: 'group-hover:border-cyan-400/50',
      glowColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-400',
      spotlightColor: 'rgba(34, 211, 238, 0.12)',
      delayMs: 0,
    },
    {
      id: 'booking-mgmt',
      icon: CalendarCheck,
      iconAnim: 'group-hover:scale-110 group-hover:-rotate-3',
      title: 'Booking Management',
      description: 'Track reservations, group check-ins, check-outs, guest waitlists, and live room chart activity in real time.',
      accentColor: 'from-blue-500/15 via-blue-500/5 to-transparent',
      borderColor: 'group-hover:border-blue-400/50',
      glowColor: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      spotlightColor: 'rgba(59, 130, 246, 0.12)',
      delayMs: 100,
    },
    {
      id: 'finance-gst',
      icon: IndianRupee,
      iconAnim: 'group-hover:scale-110 group-hover:rotate-6',
      title: 'Finance & GST',
      description: 'Manage hotel revenue, GST compliance, automated tax invoices, vendor expenses, and financial ledger posting.',
      accentColor: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
      borderColor: 'group-hover:border-emerald-400/50',
      glowColor: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      spotlightColor: 'rgba(16, 185, 129, 0.12)',
      delayMs: 200,
    },
    {
      id: 'reports-analytics',
      icon: BarChart3,
      iconAnim: 'group-hover:-translate-y-1',
      title: 'Reports & Analytics',
      description: 'Get actionable operational insights, Occupancy ARR/RevPAR metrics, MIS reports, and owner profit dashboards.',
      accentColor: 'from-indigo-500/15 via-indigo-500/5 to-transparent',
      borderColor: 'group-hover:border-indigo-400/50',
      glowColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-400',
      spotlightColor: 'rgba(99, 102, 241, 0.12)',
      delayMs: 300,
    },
    {
      id: 'whatsapp-billing',
      icon: MessageSquare,
      iconAnim: 'group-hover:scale-110 animate-pulse',
      title: 'WhatsApp Billing',
      description: 'Send bills, check-in confirmations, digital folios, and instant updates directly to guests via WhatsApp.',
      accentColor: 'from-teal-500/15 via-teal-500/5 to-transparent',
      borderColor: 'group-hover:border-teal-400/50',
      glowColor: 'bg-teal-500/20',
      iconColor: 'text-teal-400',
      spotlightColor: 'rgba(20, 184, 166, 0.12)',
      delayMs: 100,
    },
    {
      id: 'staff-mgmt',
      icon: Users,
      iconAnim: 'group-hover:scale-110 group-hover:translate-x-0.5',
      title: 'Staff Management',
      description: 'Manage staff roles, shift attendance, salary advances, settlements, and staff duty responsibilities.',
      accentColor: 'from-cyan-500/15 via-blue-500/5 to-transparent',
      borderColor: 'group-hover:border-cyan-400/50',
      glowColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-400',
      spotlightColor: 'rgba(6, 182, 212, 0.12)',
      delayMs: 200,
    },
    {
      id: 'guest-mgmt',
      icon: UserCheck,
      iconAnim: 'group-hover:scale-110 group-hover:-rotate-3',
      title: 'Guest Management',
      description: 'Maintain detailed guest CRM profiles, VIP preferences, corporate rate plans, and loyalty history.',
      accentColor: 'from-blue-500/15 via-indigo-500/5 to-transparent',
      borderColor: 'group-hover:border-blue-400/50',
      glowColor: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      spotlightColor: 'rgba(59, 130, 246, 0.12)',
      delayMs: 300,
    },
    {
      id: 'revenue-mgmt',
      icon: TrendingUp,
      iconAnim: 'group-hover:-translate-y-1 group-hover:translate-x-1',
      title: 'Revenue Management',
      description: 'Monitor daily revenue trends, OTA channel rates, dynamic rate rules, and seasonal pricing opportunities.',
      accentColor: 'from-violet-500/15 via-purple-500/5 to-transparent',
      borderColor: 'group-hover:border-violet-400/50',
      glowColor: 'bg-violet-500/20',
      iconColor: 'text-violet-400',
      spotlightColor: 'rgba(139, 92, 246, 0.12)',
      delayMs: 400,
    },
  ];

  return (
    <section
      id="features"
      ref={sectionRef}
      className="py-24 lg:py-32 bg-[#040e21] relative overflow-hidden select-none border-t border-white/5"
    >
      {/* Background Lighting & Grid System */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[550px] bg-blue-600/10 rounded-full blur-[170px]" />
        <div className="absolute bottom-10 left-1/4 w-[600px] h-[450px] bg-cyan-500/10 rounded-full blur-[150px]" />
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
        <div className="text-center max-w-3xl mx-auto mb-20">
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2.5 bg-slate-900/90 border border-blue-400/30 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-widest text-blue-300 shadow-xl transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
            </span>
            <span>PLATFORM CAPABILITIES</span>
          </div>

          {/* Heading */}
          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mt-6 mb-6 transition-all duration-700 ease-out delay-100 ${
              isVisible
                ? 'opacity-100 translate-y-0 blur-0'
                : 'opacity-0 translate-y-6 blur-sm'
            }`}
          >
            Powerful tools for{' '}
            <span className="bg-gradient-to-r from-white via-slate-100 to-blue-300 bg-clip-text text-transparent">
              modern hospitality
            </span>
          </h2>

          {/* Description */}
          <p
            className={`text-slate-400 text-base sm:text-lg leading-relaxed font-normal max-w-2xl mx-auto transition-all duration-700 ease-out delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            Built specifically to digitize Indian hotels, guest houses, and boutique resorts.
          </p>
        </div>

        {/* Subtle Horizontal Inter-module Connection Grid Lines */}
        <div className="relative">
          <div className="hidden lg:block absolute top-[25%] left-[5%] right-[5%] h-[1px] bg-gradient-to-r from-cyan-500/0 via-blue-500/15 to-violet-500/0 pointer-events-none z-0" />
          <div className="hidden lg:block absolute top-[75%] left-[5%] right-[5%] h-[1px] bg-gradient-to-r from-teal-500/0 via-indigo-500/15 to-violet-500/0 pointer-events-none z-0" />

          {/* 8 Feature Cards Grid (4 x 2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {features.map((feat, index) => {
              const IconComp = feat.icon;
              const pos = mousePositions[index];

              return (
                <div
                  key={feat.id}
                  onMouseMove={(e) => handleMouseMove(index, e)}
                  style={{
                    transitionDelay: isVisible ? `${feat.delayMs}ms` : '0ms',
                  }}
                  className={`group relative bg-[#0a1835]/85 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 lg:p-7 transition-all duration-500 transform hover:-translate-y-1.5 shadow-xl hover:shadow-2xl cursor-pointer overflow-hidden flex flex-col justify-between ${
                    feat.borderColor
                  } ${
                    isVisible
                      ? 'opacity-100 translate-y-0 scale-100'
                      : 'opacity-0 translate-y-8 scale-[0.97]'
                  }`}
                >
                  {/* Spotlight Radial Glow following cursor */}
                  {pos && (
                    <div
                      className="pointer-events-none absolute -inset-px transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, ${feat.spotlightColor}, transparent 80%)`,
                      }}
                    />
                  )}

                  {/* Interior Surface Gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-b ${feat.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                  />

                  <div>
                    {/* Icon Container */}
                    <div className="relative z-10 mb-6">
                      <div
                        className={`absolute -inset-1.5 ${feat.glowColor} rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                      />
                      <div className="relative w-[52px] h-[52px] rounded-2xl bg-slate-900/90 border border-white/15 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
                        <IconComp className={`w-6 h-6 ${feat.iconColor} ${feat.iconAnim} transition-all duration-300`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold text-white mb-2.5 tracking-tight group-hover:text-cyan-200 transition-colors">
                        {feat.title}
                      </h3>
                      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed group-hover:text-slate-200 transition-colors">
                        {feat.description}
                      </p>
                    </div>
                  </div>

                  {/* Card Bottom Indicator */}
                  <div className="relative z-10 mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] font-semibold text-slate-500 group-hover:text-cyan-300 transition-colors">
                    <span>Feature module</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

