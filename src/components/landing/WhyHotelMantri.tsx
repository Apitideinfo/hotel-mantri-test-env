import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Globe, MessageSquare, ShieldCheck, ArrowRight } from 'lucide-react';

interface CardMousePosition {
  x: number;
  y: number;
}

export const WhyHotelMantri: React.FC = () => {
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
      { threshold: 0.12 }
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

  const trustCards = [
    {
      id: 'india-first',
      label: 'INDIA-FIRST',
      title: 'Built Specifically for Indian Hotels',
      desc: 'Native GST tax calculation, multi-payment modes (UPI, Cash, Card), Indian phone formatting, and local compliance.',
      icon: CheckCircle2,
      iconAnim: 'group-hover:scale-110 group-hover:rotate-6',
      accentBorder: 'before:bg-cyan-400',
      borderColor: 'group-hover:border-cyan-400/50',
      glowColor: 'bg-cyan-500/20',
      iconColor: 'text-cyan-400',
      badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
      spotlightColor: 'rgba(34, 211, 238, 0.12)',
      delayMs: 0,
    },
    {
      id: 'cloud-access',
      label: 'ACCESS ANYWHERE',
      title: 'Zero Desktop Software Installation',
      desc: 'Access your complete hotel operations securely from any browser, tablet, or smartphone — anywhere, anytime.',
      icon: Globe,
      iconAnim: 'group-hover:scale-110 group-hover:rotate-12',
      accentBorder: 'before:bg-blue-400',
      borderColor: 'group-hover:border-blue-400/50',
      glowColor: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
      spotlightColor: 'rgba(59, 130, 246, 0.12)',
      delayMs: 120,
    },
    {
      id: 'whatsapp-comm',
      label: 'INSTANT COMMUNICATION',
      title: 'Instant WhatsApp Guest Communication',
      desc: 'Send digital GST bills, check-in vouchers, and booking confirmations directly to guests without manual typing.',
      icon: MessageSquare,
      iconAnim: 'group-hover:scale-110 animate-pulse',
      accentBorder: 'before:bg-emerald-400',
      borderColor: 'group-hover:border-emerald-400/50',
      glowColor: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
      spotlightColor: 'rgba(16, 185, 129, 0.12)',
      delayMs: 240,
    },
    {
      id: 'bank-security',
      label: 'SECURE & BACKED UP',
      title: 'Bank-Grade Data Security & Backups',
      desc: 'Your hotel financial data and guest records are encrypted with 256-bit SSL security and automatic daily cloud backups.',
      icon: ShieldCheck,
      iconAnim: 'group-hover:scale-110 group-hover:-rotate-6',
      accentBorder: 'before:bg-indigo-400',
      borderColor: 'group-hover:border-indigo-400/50',
      glowColor: 'bg-indigo-500/20',
      iconColor: 'text-indigo-400',
      badgeBg: 'bg-indigo-500/10 text-indigo-300 border-indigo-400/30',
      spotlightColor: 'rgba(99, 102, 241, 0.12)',
      delayMs: 360,
    },
  ];

  return (
    <section
      id="why-hotelmantri"
      ref={sectionRef}
      className="py-24 lg:py-32 bg-[#040e21] relative overflow-hidden select-none border-t border-white/5"
    >
      {/* Background Lighting System */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[750px] h-[500px] bg-cyan-500/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-10 right-1/4 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[140px]" />
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
            className={`inline-flex items-center gap-2.5 bg-slate-900/90 border border-cyan-400/30 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-widest text-cyan-300 shadow-xl transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>WHY HOTELMANTRI?</span>
          </div>

          {/* Heading */}
          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mt-6 mb-6 transition-all duration-700 ease-out delay-100 ${
              isVisible
                ? 'opacity-100 translate-y-0 blur-0'
                : 'opacity-0 translate-y-6 blur-sm'
            }`}
          >
            Why{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
              leading hotel owners
            </span>{' '}
            choose us
          </h2>

          {/* Description */}
          <p
            className={`text-slate-400 text-base sm:text-lg leading-relaxed font-normal max-w-2xl mx-auto transition-all duration-700 ease-out delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            Replace legacy offline software with a modern connected platform.
          </p>
        </div>

        {/* 2 x 2 Trust Modules Grid */}
        <div className="relative">
          {/* Inter-card connection line */}
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-cyan-500/0 via-blue-500/15 to-indigo-500/0 pointer-events-none z-0" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {trustCards.map((card, index) => {
              const IconComp = card.icon;
              const pos = mousePositions[index];

              return (
                <div
                  key={card.id}
                  onMouseMove={(e) => handleMouseMove(index, e)}
                  style={{
                    transitionDelay: isVisible ? `${card.delayMs}ms` : '0ms',
                  }}
                  className={`group relative bg-[#0a1835]/85 backdrop-blur-xl border border-white/10 rounded-[26px] p-7 sm:p-8 transition-all duration-500 transform hover:-translate-y-1.5 shadow-xl hover:shadow-2xl cursor-pointer overflow-hidden flex flex-col justify-between before:absolute before:left-0 before:top-5 before:bottom-5 before:w-[3px] before:rounded-r-full before:opacity-0 hover:before:opacity-100 before:transition-opacity ${
                    card.accentBorder
                  } ${card.borderColor} ${
                    isVisible
                      ? 'opacity-100 translate-y-0 scale-100'
                      : 'opacity-0 translate-y-8 scale-[0.97]'
                  }`}
                >
                  {/* Spotlight Cursor Follower */}
                  {pos && (
                    <div
                      className="pointer-events-none absolute -inset-px transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, ${card.spotlightColor}, transparent 80%)`,
                      }}
                    />
                  )}

                  <div>
                    {/* Header: Icon + Label Pill */}
                    <div className="relative z-10 flex items-center justify-between mb-6">
                      <div className="relative">
                        {/* Glow behind Icon */}
                        <div
                          className={`absolute -inset-1.5 ${card.glowColor} rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                        />
                        <div className="relative w-[52px] h-[52px] rounded-2xl bg-slate-900/90 border border-white/15 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
                          <IconComp className={`w-6 h-6 ${card.iconColor} ${card.iconAnim} transition-all duration-300`} />
                        </div>
                      </div>

                      <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full border backdrop-blur-md transition-all duration-300 ${card.badgeBg}`}>
                        {card.label}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="relative z-10">
                      <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight group-hover:text-cyan-200 transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-slate-400 text-sm sm:text-base leading-relaxed group-hover:text-slate-200 transition-colors">
                        {card.desc}
                      </p>
                    </div>
                  </div>

                  {/* Card Bottom Indicator */}
                  <div className="relative z-10 mt-8 pt-5 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-cyan-300 transition-colors">
                    <span>Enterprise standard</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Trust Signal */}
        <div className="mt-16 text-center">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-900/60 border border-white/10 inline-flex items-center gap-2 px-5 py-2 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Built for modern hotel operations.
          </p>
        </div>
      </div>
    </section>
  );
};

